// Copyright (C) 2026 Sonix Music
// This file is part of Sonix Music.
// Licensed under the GNU GPL v3.0.
// See the LICENSE file in the project root for details.

const { app, BrowserWindow, ipcMain, Menu, shell, dialog } = require("electron");
const path = require("path");
const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const YTDlpWrap = require("yt-dlp-wrap").default;

const ytDlpPath = path.join(__dirname, "bin", "yt-dlp.exe").replace('app.asar', 'app.asar.unpacked');
const ytDlp = new YTDlpWrap(ytDlpPath);
Menu.setApplicationMenu(null);

let _settingsCache = null;
function settingsFile() {
  try { return path.join(app.getPath("userData"), "sonix_settings.json"); }
  catch (_) { return path.join(os.homedir(), ".sonix_settings.json"); }
}
function defaultSettings() {
  return { downloadDir: path.join(os.homedir(), "Downloads", "Sonix", "Music") };
}
function loadSettings() {
  if (_settingsCache) return _settingsCache;
  try {
    const f = settingsFile();
    if (fs.existsSync(f)) _settingsCache = { ...defaultSettings(), ...JSON.parse(fs.readFileSync(f, "utf8")) };
    else _settingsCache = defaultSettings();
  } catch (_) { _settingsCache = defaultSettings(); }
  return _settingsCache;
}
function saveSettings(s) {
  _settingsCache = { ...defaultSettings(), ...s };
  try { fs.writeFileSync(settingsFile(), JSON.stringify(_settingsCache, null, 2)); } catch (_) { }
}


let streamingServer = null, currentCdnUrl = null, activeReq = null;

function startStreamingServer() {
  streamingServer = http.createServer((req, res) => {
    if (activeReq) { try { activeReq.destroy(); } catch (_) { } activeReq = null; }
    if (!currentCdnUrl) { res.writeHead(404); res.end("No stream"); return; }
    let cdnUrl;
    try { cdnUrl = new URL(currentCdnUrl); } catch (e) { res.writeHead(500); res.end("Bad URL"); return; }
    const opts = {
      hostname: cdnUrl.hostname, path: cdnUrl.pathname + cdnUrl.search, method: "GET",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0)", "Referer": "https://www.youtube.com/", "Origin": "https://www.youtube.com" }
    };
    if (req.headers.range) opts.headers["Range"] = req.headers.range;
    const pr = https.request(opts, (pres) => {
      const status = pres.statusCode === 206 ? 206 : 200;
      const h = { "Content-Type": pres.headers["content-type"] || "audio/webm", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" };
      if (pres.headers["content-length"]) h["Content-Length"] = pres.headers["content-length"];
      if (pres.headers["content-range"]) h["Content-Range"] = pres.headers["content-range"];
      if (pres.headers["accept-ranges"]) h["Accept-Ranges"] = pres.headers["accept-ranges"];
      res.writeHead(status, h); pres.pipe(res);
    });
    pr.on("error", () => { if (!res.headersSent) { res.writeHead(502); res.end("CDN error"); } });
    pr.end(); activeReq = pr;
    req.on("close", () => { if (activeReq) { try { activeReq.destroy(); } catch (_) { } activeReq = null; } });
  });
  streamingServer.listen(19567, "127.0.0.1", () => console.log("Stream server ready"));
}

let mainWindow = null;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 800, minHeight: 600, frame: false, backgroundColor: "#0c0c14",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true }
  });
  mainWindow.setMenuBarVisibility(false);

  mainWindow.hookWindowMessage(278, () => {
    mainWindow.setEnabled(false);
    setTimeout(() => { mainWindow.setEnabled(true); }, 100);
    return true;
  });

  mainWindow.loadFile("renderer/index.html");
}
app.whenReady().then(() => { startStreamingServer(); createWindow(); });
app.on("window-all-closed", () => {
  if (activeReq) try { activeReq.destroy(); } catch (_) { }
  if (streamingServer) streamingServer.close();
  app.quit();
});


ipcMain.on("window-control", (event, action) => {
  if (!mainWindow) return;
  if (action === "minimize") mainWindow.minimize();
  if (action === "maximize") { if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize(); }
  if (action === "close") mainWindow.close();
});

ipcMain.on("open-external", (event, url) => {
  if (url) shell.openExternal(url);
});

function persistentDataFile() {
  try {
    const dir = path.join(app.getPath("appData"), "Sonix Music");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, "sonix_app_data.json");
  } catch (_) { return path.join(os.homedir(), ".sonix_app_data.json"); }
}
let persistentDataCache = null;
function loadPersistentData() {
  if (persistentDataCache) return persistentDataCache;
  try {
    const p = persistentDataFile();
    if (fs.existsSync(p)) persistentDataCache = JSON.parse(fs.readFileSync(p, "utf8"));
    else persistentDataCache = {};
  } catch (_) { persistentDataCache = {}; }
  return persistentDataCache;
}
ipcMain.on("sync-get-data", (event) => { event.returnValue = loadPersistentData(); });
ipcMain.on("sync-save-data", (event, { k, v }) => {
  const d = loadPersistentData();
  d[k] = v; persistentDataCache = d;
  try { fs.writeFileSync(persistentDataFile(), JSON.stringify(d)); } catch (_) {}
});

ipcMain.handle("get-app-version", () => { try { return require("./package.json").version || "1.0.0"; } catch (_) { return "1.0.0"; } });
ipcMain.handle("get-settings", () => loadSettings());
ipcMain.handle("save-settings", (_, s) => { saveSettings(s); return true; });
ipcMain.handle("dialog-open-dir", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Choose Download Folder",
    defaultPath: loadSettings().downloadDir
  });
  return result.canceled ? null : result.filePaths[0];
});


ipcMain.handle("get-offline-songs", async () => {
  const { downloadDir } = loadSettings();
  try {
    if (!fs.existsSync(downloadDir)) return [];
    return fs.readdirSync(downloadDir)
      .filter(f => /\.(m4a|webm|mp3|opus)$/i.test(f))
      .map(f => {
        const fp = path.join(downloadDir, f);
        try {
          const s = fs.statSync(fp);
          return { filename: f, path: fp, size: s.size, mtime: s.mtimeMs };
        } catch (_) { return null; }
      }).filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime);
  } catch (_) { return []; }
});


ipcMain.handle("search", async (event, query) => {
  try {
    const result = await ytDlp.execPromise([`ytsearch20:${query}`, "--flat-playlist", "--dump-json", "--no-warnings", "--match-filter", "!is_live"]);
    return result.split("\n").filter(Boolean).map(line => {
      try {
        const d = JSON.parse(line);
        const raw = d.webpage_url || d.url || d.id;
        return {
          title: d.title,
          url: raw && raw.startsWith("http") ? raw : `https://www.youtube.com/watch?v=${raw || d.id}`,
          id: d.id,
          thumbnail: d.thumbnails?.length ? d.thumbnails[d.thumbnails.length - 1].url : `https://i.ytimg.com/vi/${d.id}/hqdefault.jpg`,
          duration: d.duration,
          channel: d.channel || d.uploader || ''
        };
      } catch (_) { return null; }
    }).filter(Boolean);
  } catch (err) { return []; }
});


ipcMain.handle("get-audio", async (event, videoUrl) => {
  try {
    const watchUrl = videoUrl.startsWith("http") ? videoUrl : `https://www.youtube.com/watch?v=${videoUrl}`;
    const cdnUrl = await ytDlp.execPromise([watchUrl, "-f", "140/bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best", "--get-url", "--no-playlist", "--no-warnings", "--extractor-args", "youtube:player_client=android,web"]);
    const resolved = cdnUrl.trim().split("\n")[0];
    if (!resolved || !resolved.startsWith("http")) return null;
    currentCdnUrl = resolved;
    return `http://127.0.0.1:19567/stream?t=${Date.now()}`;
  } catch (err) { return null; }
});


function getFinalUrlAndSize(url) {
  return new Promise(resolve => {
    let currentUrl = url;
    let redirects = 0;
    const fetchStep = () => {
      if (redirects > 5) return resolve({ url: currentUrl, size: 0 });
      try {
        const u = new URL(currentUrl);
        const req = https.request({
          hostname: u.hostname, path: u.pathname + u.search, method: "GET",
          headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://www.youtube.com/", "Range": "bytes=0-0" } // Fast GET instead of HEAD
        }, res => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            currentUrl = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, currentUrl).href;
            redirects++;
            fetchStep();
          } else {
            let size = 0;
            if (res.headers["content-range"]) {
              const m = res.headers["content-range"].match(/\/(\d+)/);
              if (m) size = parseInt(m[1], 10);
            } else if (res.headers["content-length"]) {
              size = parseInt(res.headers["content-length"], 10);
            }
            resolve({ url: currentUrl, size });
          }
        });
        req.on("error", () => resolve({ url: currentUrl, size: 0 }));
        req.setTimeout(6000, () => { req.destroy(); resolve({ url: currentUrl, size: 0 }); });
        req.end();
      } catch (_) { resolve({ url: currentUrl, size: 0 }); }
    };
    fetchStep();
  });
}


function downloadRange(url, start, end) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const bufs = [];
      const req = https.request({
        hostname: u.hostname, path: u.pathname + u.search, method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0", "Referer": "https://www.youtube.com/",
          "Range": `bytes=${start}-${end}`
        }
      }, res => {
        res.on("data", c => bufs.push(c));
        res.on("end", () => resolve(Buffer.concat(bufs)));
        res.on("error", reject);
      });
      req.on("error", reject);
      req.end();
    } catch (e) { reject(e); }
  });
}


ipcMain.handle("download-song", async (event, { videoUrl, filename }) => {
  try {
    const { downloadDir } = loadSettings();
    const watchUrl = videoUrl.startsWith("http") ? videoUrl : `https://www.youtube.com/watch?v=${videoUrl}`;
    const cdnRaw = await ytDlp.execPromise([watchUrl, "-f", "140/bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio", "--get-url", "--no-playlist", "--no-warnings"]);
    const cdnUrl = cdnRaw.trim().split("\n")[0];
    if (!cdnUrl || !cdnUrl.startsWith("https")) throw new Error("Could not resolve download URL");

    fs.mkdirSync(downloadDir, { recursive: true });
    const safe = filename.replace(/[\\/:*?"<>|]/g, "_");
    const dest = path.join(downloadDir, safe);

    const { url: finalUrl, size: total } = await getFinalUrlAndSize(cdnUrl);
    const NUM_CHUNKS = 4;
    const MIN_PARALLEL = 512 * 1024;

    if (total > MIN_PARALLEL) {
      const chunkSize = Math.ceil(total / NUM_CHUNKS);
      const received = new Array(NUM_CHUNKS).fill(0);

      const reportProgress = () => {
        const totalReceived = received.reduce((a, b) => a + b, 0);
        const pct = Math.round((totalReceived / total) * 100);
        const mb = (totalReceived / 1048576).toFixed(1);
        const tot = (total / 1048576).toFixed(1);
        try { event.sender.send("download-progress", { filename, received: totalReceived, total, pct, mb, tot }); } catch (_) { }
      };

      const chunkBuffers = await Promise.all(
        Array.from({ length: NUM_CHUNKS }, (_, i) => {
          const start = i * chunkSize;
          const end = Math.min((i + 1) * chunkSize - 1, total - 1);
          return new Promise((resolve, reject) => {
            try {
              const u = new URL(finalUrl);
              const bufs = [];
              const req = https.request({
                hostname: u.hostname, path: u.pathname + u.search, method: "GET",
                headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://www.youtube.com/", "Range": `bytes=${start}-${end}` }
              }, res => {
                if (res.statusCode >= 300) { reject(new Error("HTTP " + res.statusCode)); return; }
                res.on("data", chunk => { bufs.push(chunk); received[i] += chunk.length; reportProgress(); });
                res.on("end", () => resolve(Buffer.concat(bufs)));
                res.on("error", reject);
              });
              req.on("error", reject);
              req.end();
            } catch (e) { reject(e); }
          });
        })
      );

      const fd = fs.openSync(dest, "w");
      for (const buf of chunkBuffers) fs.writeSync(fd, buf);
      fs.closeSync(fd);

    } else {

      await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const u = new URL(finalUrl);
        https.get({
          hostname: u.hostname, path: u.pathname + u.search,
          headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://www.youtube.com/", "Origin": "https://www.youtube.com" }
        }, res => {
          if (res.statusCode >= 300) { reject(new Error("HTTP " + res.statusCode)); return; }
          let received = 0;
          res.on("data", chunk => {
            received += chunk.length;
            try { event.sender.send("download-progress", { filename, received, total: 0, pct: -1, mb: (received / 1048576).toFixed(1), tot: null }); } catch (_) { }
          });
          res.pipe(file);
          file.on("finish", () => { file.close(); resolve(); });
          file.on("error", reject);
        }).on("error", reject);
      });
    }

    try { event.sender.send("download-progress", { filename, received: total, total, pct: 100, done: true }); } catch (_) { }
    shell.showItemInFolder(dest);
    return { ok: true, path: dest };
  } catch (e) { return { ok: false, error: e.message }; }
});
