// Copyright (C) 2026 Sonix Music
// This file is part of Sonix Music.
// Licensed under the GNU GPL v3.0.
// See the LICENSE file in the project root for details.

const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("api", {
  windowControl:       (action) => ipcRenderer.send("window-control", action),
  getAudio:            (url)    => ipcRenderer.invoke("get-audio", url),
  search:              (query)  => ipcRenderer.invoke("search", query),
  downloadSong:        (opts)   => ipcRenderer.invoke("download-song", opts),
  getAppVersion:       ()       => ipcRenderer.invoke("get-app-version"),
  onDownloadProgress:  (cb)     => ipcRenderer.on("download-progress", (_e, data) => cb(data)),
  offDownloadProgress: (cb)     => ipcRenderer.removeListener("download-progress", cb),
  getSettings:         ()       => ipcRenderer.invoke("get-settings"),
  saveSettings:        (s)      => ipcRenderer.invoke("save-settings", s),
  getOfflineSongs:     ()       => ipcRenderer.invoke("get-offline-songs"),
  openDirDialog:       ()       => ipcRenderer.invoke("dialog-open-dir"),
  openExternal:        (url)    => ipcRenderer.send("open-external", url),
  getAppSyncData:      ()       => ipcRenderer.sendSync("sync-get-data"),
  saveAppSyncData:     (k, v)   => ipcRenderer.send("sync-save-data", {k, v})
});

