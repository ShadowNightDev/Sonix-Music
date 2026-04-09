let audio = null;
let isPlaying = false;
let queue = [];
let manualQueue = [];
let queueIndex = -1;
let isMaximized = false;
let isShuffled = false;
let repeatMode = 0;
let rightPanelOpen = true;
let sidebarOpen = true;
let currentView = 'home';
let navHistory = ['home'];
let navPos = 0;
let playToken = 0;
let downloadQueue = {};
let currentSongInfo = null;
let ctxTargetSong = null;
const songDataMap = new Map();
let lyricsCollapsed = false;
let lyricsInterval = null;
let lyricsData = [];
let submenuHideTimer = null;
let appMenuSubHideTimer = null;
let shareReceivedSong = null;
let currentPlaylistId = null;
let appSettings = { downloadDir: '' };

const _persistentData = window.api && window.api.getAppSyncData ? window.api.getAppSyncData() : {};

try {
  ['playlists', 'folders', 'liked', 'recent', 'artists', 'thumbCache', 'artistCache'].forEach(k => {
    const lsVal = localStorage.getItem('sonix_' + k);
    if (lsVal && !_persistentData[k]) {
      _persistentData[k] = JSON.parse(lsVal);
      if (window.api && window.api.saveAppSyncData) window.api.saveAppSyncData(k, _persistentData[k]);
    }
  });
} catch (_) { }

function save(k, v) {
  _persistentData[k] = v;
  try { if (window.api && window.api.saveAppSyncData) window.api.saveAppSyncData(k, v); } catch (_) { }
}
function load(k) {
  return _persistentData[k] || null;
}

const sectionData = {};
let playlists = load('playlists') || [];
let folders = load('folders') || [];
let likedSongs = load('liked') || [];
let recentPlayed = load('recent') || [];
let savedArtists = load('artists') || [];
let thumbCache = load('thumbCache') || {};
let artistCache = load('artistCache') || {};

function toggleMaximize() {
  isMaximized = !isMaximized; window.api.windowControl('maximize');
  document.getElementById('max-btn').innerHTML = isMaximized
    ? `<svg width="10" height="10" viewBox="0 0 10 10"><rect x="2" y="0" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1"/><rect x="0" y="2" width="8" height="8" fill="#0c0c14" stroke="currentColor" stroke-width="1"/></svg>`
    : `<svg width="10" height="10" viewBox="0 0 10 10"><rect x=".5" y=".5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/></svg>`;
}

function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  document.getElementById('panel-left').classList.toggle('collapsed', !sidebarOpen);
}

function toggleAppMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('app-menu');
  menu.classList.toggle('hidden');
}
function closeAppMenu() { document.getElementById('app-menu').classList.add('hidden'); document.getElementById('app-menu-playlist-sub')?.classList.add('hidden'); }

function showAppMenuPlaylistSub() {
  cancelHideAppMenuSub();
  const trigger = document.getElementById('app-menu-playlist-trigger');
  const sub = document.getElementById('app-menu-playlist-sub');
  if (!trigger || !sub) return;
  const rect = trigger.getBoundingClientRect();
  sub.style.left = (rect.right + 4) + 'px';
  sub.style.top = Math.min(rect.top, window.innerHeight - 300) + 'px';
  const listEl = document.getElementById('app-menu-playlist-list');
  listEl.innerHTML = playlists.length
    ? playlists.map(pl => `
        <div class="popup-item" onclick="openPlaylist('${pl.id}');closeAppMenu()">
          <div class="popup-icon" style="background:linear-gradient(135deg,${pl.color[0]},${pl.color[1]})">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M15 6H3v2h12V6z"/></svg>
          </div>
          <div class="popup-text"><div class="popup-title">${pl.name}</div><div class="popup-desc">${pl.songs.length} songs</div></div>
        </div>`).join('')
    : '<div style="padding:8px 12px;font-size:12px;color:var(--text-muted)">No playlists yet</div>';
  sub.classList.remove('hidden');
}
function scheduleHideAppMenuSub() { appMenuSubHideTimer = setTimeout(() => document.getElementById('app-menu-playlist-sub')?.classList.add('hidden'), 200); }
function cancelHideAppMenuSub() { clearTimeout(appMenuSubHideTimer); }

async function showAboutModal() {
  closeAppMenu();
  try { const v = await window.api.getAppVersion(); document.getElementById('about-version').textContent = v; } catch (_) { }
  openModal('about-modal');
}
function openDiscord() {
  closeAppMenu();
  const url = 'https://discord.gg/PC6j7ZHjv5';
  if (window.api && window.api.openExternal) {
    window.api.openExternal(url);
  } else {
    window.open ? window.open(url, '_blank') : navigator.clipboard.writeText(url).then(() => showToast('Discord URL copied'));
  }
}

function toggleRightPanel() {
  rightPanelOpen = !rightPanelOpen;
  document.getElementById('panel-right').classList.toggle('collapsed', !rightPanelOpen);
  document.getElementById('np-toggle').classList.toggle('active', rightPanelOpen);
}
function switchRightTab(tab) {
  ['nowplaying', 'queue'].forEach(t => {
    document.getElementById('rp-' + t).classList.toggle('hidden', t !== tab);
    document.getElementById('tab-' + t)?.classList.toggle('active', t === tab);
  });
}
function switchToNowPlaying() {
  if (!rightPanelOpen) { rightPanelOpen = true; document.getElementById('panel-right').classList.remove('collapsed'); }
  switchRightTab('nowplaying');
}

function toggleLyricsCollapse() {
  lyricsCollapsed = !lyricsCollapsed;
  document.getElementById('lyrics-collapsed-wrap').classList.toggle('collapsed', lyricsCollapsed);
  document.getElementById('lyrics-chevron').style.transform = lyricsCollapsed ? 'rotate(-90deg)' : '';
}
function expandLyrics() {
  const overlay = document.getElementById('lyrics-overlay');
  overlay.classList.remove('hidden');
  document.getElementById('lyrics-overlay-lines').innerHTML =
    document.getElementById('lyrics-lines').innerHTML.replace(/lyric-line-sm/g, 'lyric-line-full');
  if (currentSongInfo) {
    document.getElementById('lyrics-overlay-title').textContent = currentSongInfo.displayTitle || currentSongInfo.title;
    document.getElementById('lyrics-overlay-artist').textContent = currentSongInfo.artist || '';
    const img = document.getElementById('lyrics-overlay-art');
    if (currentSongInfo.thumbnail) { img.src = currentSongInfo.thumbnail; img.style.display = ''; }
    else img.style.display = 'none';
  }
}
function collapseLyrics() { document.getElementById('lyrics-overlay').classList.add('hidden'); }

function showView(v) {
  ['home', 'search', 'liked', 'playlist'].forEach(n =>
    document.getElementById(n + '-view').classList.toggle('hidden', n !== v)
  );
  currentView = v;
}
function goBack() { if (navPos > 0) { navPos--; showView(navHistory[navPos]); } }
function goForward() { if (navPos < navHistory.length - 1) { navPos++; showView(navHistory[navPos]); } }
function navigate(v) {
  navHistory = navHistory.slice(0, navPos + 1);
  navHistory.push(v); navPos = navHistory.length - 1; showView(v);
}
function showLiked() { navigate('liked'); renderLikedView(); }
function showSearch() { navigate('search'); document.getElementById('search').focus(); }
function showHome() { navigate('home'); }

function filterLib(type, btn) {
  document.querySelectorAll('.lib-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  const offlineLabel = document.getElementById('lib-offline-label');
  const offlineItems = document.getElementById('offline-lib-items');
  const likedItem = document.querySelector('.lib-pinned');
  const plLabel = document.getElementById('lib-playlists-label');
  const plItems = document.getElementById('playlist-lib-items');
  const flLabel = document.getElementById('lib-folders-label');
  const flItems = document.getElementById('folder-lib-items');
  const recentLabel = document.querySelector('.lib-section-label:not([id])');
  const recentItems = document.getElementById('recent-lib-items');

  if (type === 'offline') {
    [likedItem, plLabel, plItems, flLabel, flItems, recentLabel, recentItems]
      .forEach(el => { if (el) el.style.display = 'none'; });
    if (offlineLabel) offlineLabel.style.display = '';
    if (offlineItems) offlineItems.style.display = '';
    renderOfflineLib(true);
  } else if (type === 'playlists') {
    if (offlineLabel) offlineLabel.style.display = 'none';
    if (offlineItems) offlineItems.style.display = 'none';
    if (recentLabel) recentLabel.style.display = 'none';
    if (recentItems) recentItems.style.display = 'none';
    if (likedItem) likedItem.style.display = '';
    if (plLabel) plLabel.style.display = playlists.length ? '' : 'none';
    if (plItems) plItems.style.display = '';
    if (flLabel) flLabel.style.display = folders.length ? '' : 'none';
    if (flItems) flItems.style.display = '';
  } else {
    if (offlineLabel) offlineLabel.style.display = '';
    if (offlineItems) offlineItems.style.display = '';
    [likedItem, recentLabel, recentItems, plItems, flItems].forEach(el => { if (el) el.style.display = ''; });
    if (plLabel) plLabel.style.display = playlists.length ? '' : 'none';
    if (flLabel) flLabel.style.display = folders.length ? '' : 'none';
    renderOfflineLib();
  }
}
async function renderOfflineLib(showAll = false) {
  const el = document.getElementById('offline-lib-items');
  const label = document.getElementById('lib-offline-label');
  if (!el) return;
  el.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:var(--text-muted)">Scanning…</div>';
  try {
    const files = await window.api.getOfflineSongs();
    if (!files || !files.length) {
      if (label) label.style.display = 'none';
      el.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:var(--text-muted)">No downloaded songs found.<br>Path: <span style="opacity:.6">' + (appSettings.downloadDir || 'not set') + '</span></div>';
      return;
    }
    if (label) label.style.display = '';
    const knownSongs = [...likedSongs, ...recentPlayed, ...playlists.flatMap(p => p.songs || [])];
    const enriched = files.map(f => {
      const name = f.filename.replace(/\.(m4a|webm|mp3|opus)$/i, '');
      const mb = (f.size / 1048576).toFixed(1);
      const safePath = f.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const safeNameQ = name.replace(/'/g, "\\'");
      const isFileMatch = s => {
        const exp = ((s.displayTitle || s.title) || '').replace(/[\\/:*?"<>|]/g, '_');
        return name === exp || (exp.length >= 8 && name.startsWith(exp.substring(0, Math.min(20, exp.length))));
      };

      const match =
        knownSongs.find(s => !s.url.startsWith('file://') && s.thumbnail && s.artist && isFileMatch(s)) ||
        knownSongs.find(s => s.thumbnail && isFileMatch(s)) ||
        knownSongs.find(s => isFileMatch(s)) || null;
      const thumbnail = match?.thumbnail || resolveThumbnail({ displayTitle: name, title: name });
      const fileUrl = 'file:///' + f.path.replace(/\\/g, '/');
      const song = match ? { ...match, url: fileUrl } : { url: fileUrl, title: name, displayTitle: name, artist: 'Downloaded', thumbnail };
      const songArtist = resolveArtist({ displayTitle: name, title: name, artist: song.artist });
      if (songArtist && songArtist !== 'Downloaded') song.artist = songArtist;
      if (match && match.url) downloadQueue[match.url] = 'done';
      const key = regSong(song);

      if (!thumbnail || !songArtist || songArtist === 'Downloaded') queueMetadataFetch(name);

      return { name, mb, safePath, safeNameQ, thumbnail, key, artist: song.artist };
    });
    const LIMIT = showAll ? enriched.length : 5;
    const shown = enriched.slice(0, LIMIT);
    const extra = enriched.length - LIMIT;
    el.innerHTML = shown.map(({ name, mb, safePath, safeNameQ, thumbnail, key, artist }) => `
      <div class="lib-item" onclick="playOfflineSong('${safePath}','${safeNameQ}')" oncontextmenu="showCtxMenu(event,'${key}')" style="cursor:pointer">
        <div class="lib-item-icon" style="overflow:hidden;background:linear-gradient(135deg,#1e1a4a,#2a1666)">
          ${thumbnail
        ? `<img src="${thumbnail}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="#a78bff"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`}
        </div>
        <div class="lib-item-info">
          <div class="lib-item-name">${name}</div>
          <div class="lib-item-meta">${artist && artist !== 'Downloaded' ? artist + ' · ' : 'Downloaded · '}${mb} MB</div>
        </div>
      </div>`).join('')
      + (extra > 0 ? `
      <div class="lib-item" style="cursor:pointer;opacity:.7" onclick="showAllDownloaded()">
        <div class="lib-item-icon" style="background:var(--bg-elevated);display:flex;align-items:center;justify-content:center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="opacity:.45"><path d="M4 6h16v2H4zm4 5h8v2H8zm2 5h4v2h-4z"/></svg>
        </div>
        <div class="lib-item-info">
          <div class="lib-item-name">+${extra} more songs</div>
          <div class="lib-item-meta">View all downloaded</div>
        </div>
      </div>` : '');
  } catch (e) {
    el.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:#ff5060">Error scanning folder</div>';
  }
}
function showAllDownloaded() {
  const btn = document.querySelector('.lib-chip[onclick*="offline"]');
  if (btn) filterLib('offline', btn);
}

function filterLibItems(query) {
  const q = query.trim().toLowerCase();
  const lib = document.getElementById('lib-list');
  if (!lib) return;
  if (!q) {

    renderRecentLib();
    lib.querySelectorAll('.lib-item').forEach(el => { el.style.display = ''; });
    const activeChip = document.querySelector('.lib-chip.active');
    if (activeChip) {
      const typeText = activeChip.textContent.trim().toLowerCase();
      filterLib(typeText === 'downloaded' ? 'offline' : typeText, activeChip);
    }
    return;
  }

  const recentEl = document.getElementById('recent-lib-items');
  if (recentEl && recentPlayed.length > 5) {
    recentEl.innerHTML = recentPlayed.map((song, i) => {
      const key = regSong(song);
      return `
      <div class="lib-item" onclick="libItemClick(event,${i})" oncontextmenu="showCtxMenu(event,'${key}')">
        <div class="lib-item-icon" style="overflow:hidden;background:var(--bg-elevated)">
          ${song.thumbnail
          ? `<img src="${song.thumbnail}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:900;color:rgba(255,255,255,.2)">${(song.displayTitle || song.title || '?')[0]}</div>`}
        </div>
        <div class="lib-item-info">
          <div class="lib-item-name">${song.displayTitle || song.title}</div>
          <div class="lib-item-meta">${song.artist || 'Song'}</div>
        </div>
      </div>`;
    }).join('');
  }
  const seen = new Set();
  lib.querySelectorAll('.lib-item').forEach(el => {
    const name = el.querySelector('.lib-item-name')?.textContent?.toLowerCase() || '';
    const meta = el.querySelector('.lib-item-meta')?.textContent?.toLowerCase() || '';
    if (name && (name.includes(q) || meta.includes(q))) {
      const normName = name.replace(/[^a-z0-9]/g, '');
      if (seen.has(normName) && normName.length > 0) {
        el.style.display = 'none';
      } else {
        seen.add(normName);
        el.style.display = '';
      }
    } else {
      el.style.display = 'none';
    }
  });
  lib.querySelectorAll('.lib-section-label,[id$="-label"]').forEach(label => {
    label.style.display = 'none';
  });
}
function toggleLibSearchClear(val) {
  const btn = document.getElementById('lib-search-clear');
  if (btn) btn.style.display = val ? '' : 'none';
}
function clearLibSearch() {
  const input = document.getElementById('lib-search-input');
  if (input) { input.value = ''; filterLibItems(''); }
  toggleLibSearchClear('');
}



async function playOfflineSong(filePath, displayName) {
  const fileUrl = 'file:///' + filePath.replace(/\\/g, '/');
  const knownSongs = [...likedSongs, ...recentPlayed, ...playlists.flatMap(p => p.songs || [])];
  const isMatch = s => {
    const exp = ((s.displayTitle || s.title) || '').replace(/[\\/:*?"<>|]/g, '_');
    return displayName === exp || (exp.length >= 8 && displayName.startsWith(exp.substring(0, Math.min(22, exp.length))));
  };

  const match =
    knownSongs.find(s => !s.url.startsWith('file://') && s.thumbnail && s.artist && isMatch(s)) ||
    knownSongs.find(s => s.thumbnail && isMatch(s)) ||
    knownSongs.find(s => isMatch(s)) || null;
  const song = match
    ? { ...match, url: fileUrl }
    : { url: fileUrl, title: displayName, displayTitle: displayName, artist: '', thumbnail: '' };
  if (!song.thumbnail) song.thumbnail = resolveThumbnail(song);
  if (!song.artist || song.artist === 'Downloaded') song.artist = resolveArtist({ displayTitle: displayName, title: displayName, artist: song.artist });
  queue = [song];
  queueIndex = 0;
  await play(fileUrl, song.title, song.thumbnail || '', 0, song.artist || '', song.displayTitle || displayName);
}


async function showSettingsModal() {
  closeAppMenu();
  try {
    appSettings = await window.api.getSettings();
    document.getElementById('settings-download-dir').value = appSettings.downloadDir || '';
  } catch (_) { }
  openModal('settings-modal');
}
async function saveSettings() {
  const dir = document.getElementById('settings-download-dir').value.trim();
  if (!dir) return;
  appSettings = { ...appSettings, downloadDir: dir };
  try { await window.api.saveSettings(appSettings); } catch (_) { }
  closeModal('settings-modal');
  showToast('✔ Settings saved');
}
async function browseDownloadDir() {
  try {
    const chosen = await window.api.openDirDialog();
    if (chosen) document.getElementById('settings-download-dir').value = chosen;
  } catch (_) {
    showToast('Browse not available — type path manually');
  }
}

function showAddMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('add-menu');
  const rect = e.currentTarget.getBoundingClientRect();
  menu.style.left = rect.left + 'px';
  menu.style.top = (rect.bottom + 4) + 'px';
  menu.classList.toggle('hidden');
}
function closeAllMenus() {
  ['add-menu', 'ctx-menu', 'ctx-playlist-submenu', 'app-menu', 'lib-ctx-menu'].forEach(id =>
    document.getElementById(id)?.classList.add('hidden')
  );
}
document.addEventListener('click', (e) => {
  ['add-menu', 'ctx-menu', 'ctx-playlist-submenu', 'app-menu', 'lib-ctx-menu'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.contains(e.target)) el.classList.add('hidden');
  });
});



function createPlaylist() {
  closeAllMenus();
  openModal('create-playlist-modal');
  document.getElementById('playlist-name-input').value = '';
  setTimeout(() => document.getElementById('playlist-name-input').focus(), 50);
}
function confirmCreatePlaylist() {
  const name = document.getElementById('playlist-name-input').value.trim();
  if (!name) return;
  const pl = { id: Date.now().toString(), name, songs: [], color: randomGradient() };
  playlists.unshift(pl);
  save('playlists', playlists);
  closeModal('create-playlist-modal');
  const modal = document.getElementById('create-playlist-modal');
  const folderId = modal.dataset.folderId;
  if (folderId) {
    const folder = folders.find(f => f.id === folderId);
    if (folder && !folder.playlistIds.includes(pl.id)) folder.playlistIds.push(pl.id);
    save('folders', folders);
    delete modal.dataset.folderId;
  }
  renderPlaylistLib();
  renderFolderLib();
  if (ctxTargetSong) { addSongToPlaylist(pl.id, ctxTargetSong); ctxTargetSong = null; }
}

function createFolder() {
  closeAllMenus();
  openModal('create-folder-modal');
  document.getElementById('folder-name-input').value = '';
  setTimeout(() => document.getElementById('folder-name-input').focus(), 50);
}
function confirmCreateFolder() {
  const name = document.getElementById('folder-name-input').value.trim();
  if (!name) return;
  const folder = { id: Date.now().toString(), name, playlistIds: [] };
  folders.unshift(folder);
  save('folders', folders);
  closeModal('create-folder-modal');
  renderFolderLib();
  showToast('Folder "' + name + '" created! Drag playlists into it from the sidebar.');
}
function renderFolderLib() {
  const label = document.getElementById('lib-folders-label');
  const el = document.getElementById('folder-lib-items');
  if (!folders.length) { label.style.display = 'none'; el.innerHTML = ''; return; }
  label.style.display = '';
  el.innerHTML = folders.map(f => `
    <div class="lib-item" onclick="toggleFolderExpand('${f.id}')" oncontextmenu="showLibCtxMenu(event,'folder','${f.id}')">
      <div class="lib-item-icon" style="background:linear-gradient(135deg,#2a2a40,#1a1a2e)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white" style="opacity:.5"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
      </div>
      <div class="lib-item-info">
        <div class="lib-item-name">${f.name}</div>
        <div class="lib-item-meta">Folder · ${f.playlistIds.length} playlists</div>
      </div>
      <button class="track-download-btn" onclick="event.stopPropagation();createPlaylistInFolder('${f.id}')" title="Add playlist to folder" style="margin-left:auto;flex-shrink:0;opacity:.6">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
      </button>
    </div>
    <div id="folder-expand-${f.id}" style="display:none;padding-left:14px">
      ${(f.playlistIds.map(pid => playlists.find(p => p.id === pid)).filter(Boolean)).map(pl => `
        <div class="lib-item" onclick="openPlaylist('${pl.id}')" oncontextmenu="showLibCtxMenu(event,'playlist','${pl.id}')" style="padding:5px 8px">
          <div class="lib-item-icon" style="width:30px;height:30px;background:linear-gradient(135deg,${pl.color[0]},${pl.color[1]})">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white" style="opacity:.6"><path d="M15 6H3v2h12V6z"/></svg>
          </div>
          <div class="lib-item-info">
            <div class="lib-item-name" style="font-size:12px">${pl.name}</div>
            <div class="lib-item-meta">${pl.songs.length} songs</div>
          </div>
        </div>`).join('')}
    </div>`).join('');
}
function toggleFolderExpand(id) {
  const el = document.getElementById('folder-expand-' + id);
  if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
}
async function createPlaylistInFolder(folderId) {
  closeAllMenus();
  openModal('create-playlist-modal');
  document.getElementById('playlist-name-input').value = '';
  document.getElementById('create-playlist-modal').dataset.folderId = folderId;
  setTimeout(() => document.getElementById('playlist-name-input').focus(), 50);
}

function randomGradient() {
  const p = [['#6c47ff', '#3a1a9f'], ['#ff47a3', '#9f1a60'], ['#47b4ff', '#1a609f'], ['#47ffa3', '#1a9f60'], ['#ffa347', '#9f601a']];
  return p[Math.floor(Math.random() * p.length)];
}
function renderPlaylistLib() {
  const label = document.getElementById('lib-playlists-label');
  const el = document.getElementById('playlist-lib-items');
  const folderPlaylistIds = new Set(folders.flatMap(f => f.playlistIds));
  const rootPlaylists = playlists.filter(pl => !folderPlaylistIds.has(pl.id));
  if (!rootPlaylists.length) { label.style.display = 'none'; el.innerHTML = ''; renderHomeShortcuts(); return; }
  label.style.display = '';
  el.innerHTML = rootPlaylists.map(pl => `
    <div class="lib-item" onclick="openPlaylist('${pl.id}')" oncontextmenu="showLibCtxMenu(event,'playlist','${pl.id}')">
      <div class="lib-item-icon" style="background:linear-gradient(135deg,${pl.color[0]},${pl.color[1]})">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="white" style="opacity:.6"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2z"/></svg>
      </div>
      <div class="lib-item-info">
        <div class="lib-item-name">${pl.name}</div>
        <div class="lib-item-meta">Playlist · ${pl.songs.length} songs</div>
      </div>
    </div>`).join('');
  renderHomeShortcuts();
}
function renderHomeShortcuts() {
  const grid = document.getElementById('shortcuts-grid');
  if (!grid) return;
  const playlistItems = playlists.slice(0, 5).map(pl => `
    <div class="shortcut-item" onclick="openPlaylist('${pl.id}')">
      <div class="shortcut-icon" style="background:linear-gradient(135deg,${pl.color[0]},${pl.color[1]})">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white" style="opacity:.8"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2z"/></svg>
      </div>
      <span>${pl.name}</span>
    </div>`).join('');
  grid.innerHTML = `
    <div class="shortcut-item" onclick="showLiked()">
      <div class="shortcut-icon liked-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.27 2 8.5 2 5.41 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.08C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.41 22 8.5c0 3.77-3.4 6.86-8.55 11.53L12 21.35z"/></svg></div>
      <span>Liked Songs</span>
    </div>
    ${playlistItems}`;
}
function openPlaylist(id) {
  const pl = playlists.find(p => p.id === id);
  if (!pl) return;
  currentPlaylistId = id;
  document.getElementById('pl-name').textContent = pl.name;
  document.getElementById('pl-count').textContent = pl.songs.length;
  document.getElementById('pl-icon').style.background = `linear-gradient(135deg,${pl.color[0]},${pl.color[1]})`;
  const list = document.getElementById('playlist-track-list');
  if (!pl.songs.length) {
    list.innerHTML = '<p style="padding:18px 24px;color:var(--text-muted);font-size:13px">No songs yet.<br>Right-click any song → Add to playlist.</p>';
  } else {
    queue = pl.songs.map(s => ({ ...s }));
    list.innerHTML = pl.songs.map((s, i) => makeTrackRow(s, i, 'playlist')).join('');
  }
  navigate('playlist');
}
function playPlaylistAll() {
  const pl = playlists.find(p => p.id === currentPlaylistId);
  if (!pl || !pl.songs.length) return;
  queue = pl.songs.map(s => ({ ...s })); playByIndex(0);
}
function shufflePlaylist() {
  const pl = playlists.find(p => p.id === currentPlaylistId);
  if (!pl || !pl.songs.length) return;
  queue = [...pl.songs].sort(() => Math.random() - .5);
  playByIndex(0);
  const list = document.getElementById('playlist-track-list');
  list.innerHTML = queue.map((s, i) => makeTrackRow(s, i, 'playlist')).join('');
  const btn = document.getElementById('pl-shuffle-btn');
  if (btn) btn.classList.toggle('liked', true);
}
function downloadAllPlaylist() {
  const pl = playlists.find(p => p.id === currentPlaylistId);
  if (!pl || !pl.songs.length) return;
  showConfirm(
    `Download all ${pl.songs.length} songs from "${pl.name}"?`,
    `They will be saved to your Downloads/Sonix/Music folder.`,
    () => pl.songs.forEach(s => downloadSong(s.url, s.displayTitle || s.title))
  );
}
function removeFromPlaylist(plId, songUrl) {
  const pl = playlists.find(p => p.id === plId);
  if (!pl) return;
  pl.songs = pl.songs.filter(s => s.url !== songUrl);
  save('playlists', playlists);
  renderPlaylistLib();
  openPlaylist(plId);
}
function addSongToPlaylist(plId, song) {
  const pl = playlists.find(p => p.id === plId);
  if (!pl) return;
  if (pl.songs.find(s => s.url === song.url)) { showToast('Already in ' + pl.name); return; }
  pl.songs.push({ ...song, addedAt: Date.now() });
  save('playlists', playlists);
  renderPlaylistLib();
  showToast('Added to ' + pl.name);
}

function showLibCtxMenu(e, type, id) {
  e.preventDefault(); e.stopPropagation();
  closeAllMenus();
  const menu = document.getElementById('lib-ctx-menu');
  if (!menu) return;
  document.getElementById('lib-ctx-delete').onclick = () => {
    menu.classList.add('hidden');
    if (type === 'playlist') {
      const pl = playlists.find(p => p.id === id);
      if (!pl) return;
      showConfirm(`Delete playlist "${pl.name}"?`, 'This cannot be undone.', () => {
        playlists = playlists.filter(p => p.id !== id);
        folders.forEach(f => { f.playlistIds = f.playlistIds.filter(pid => pid !== id); });
        save('playlists', playlists); save('folders', folders);
        renderPlaylistLib(); renderFolderLib(); renderHomeShortcuts();
        if (currentPlaylistId === id) { currentPlaylistId = null; navigate('home'); }
        showToast(`Playlist "${pl.name}" deleted`);
      });
    } else {
      const folder = folders.find(f => f.id === id);
      if (!folder) return;
      showConfirm(`Delete folder "${folder.name}"?`, 'Playlists inside will not be deleted.', () => {
        folders = folders.filter(f => f.id !== id);
        save('folders', folders); renderFolderLib(); renderPlaylistLib();
        showToast(`Folder "${folder.name}" deleted`);
      });
    }
  };
  document.getElementById('lib-ctx-rename').onclick = () => {
    menu.classList.add('hidden');
    if (type === 'playlist') {
      const pl = playlists.find(p => p.id === id);
      if (!pl) return;
      showPromptModal(`Rename "${pl.name}"`, pl.name, (newName) => {
        if (!newName) return;
        pl.name = newName;
        save('playlists', playlists); renderPlaylistLib(); renderFolderLib();
        if (currentPlaylistId === id) document.getElementById('pl-name').textContent = newName;
        showToast('Renamed to "' + newName + '"');
      });
    } else {
      const folder = folders.find(f => f.id === id);
      if (!folder) return;
      showPromptModal(`Rename "${folder.name}"`, folder.name, (newName) => {
        if (!newName) return;
        folder.name = newName;
        save('folders', folders); renderFolderLib();
        showToast('Renamed to "' + newName + '"');
      });
    }
  };
  const x = Math.min(e.clientX, window.innerWidth - 170);
  const y = Math.min(e.clientY, window.innerHeight - 100);
  menu.style.left = x + 'px'; menu.style.top = y + 'px';
  menu.classList.remove('hidden');
}

function showCtxMenu(e, key) {
  e.preventDefault(); e.stopPropagation();
  closeAllMenus();
  ctxTargetSong = songDataMap.get(String(key)) || null;
  if (!ctxTargetSong) return;
  const menu = document.getElementById('ctx-menu');
  const x = Math.min(e.clientX, window.innerWidth - 220);
  const y = Math.min(e.clientY, window.innerHeight - 240);
  menu.style.left = x + 'px'; menu.style.top = y + 'px';
  const liked = isLiked(ctxTargetSong.url);
  document.getElementById('ctx-like-label').textContent = liked ? 'Remove from Liked Songs' : 'Save to Liked Songs';
  document.querySelector('.ctx-like-icon').style.color = liked ? 'var(--accent)' : '';

  const ctxUrl = ctxTargetSong.url;
  const isAlreadyDL = ctxUrl.startsWith('file://') || downloadQueue[ctxUrl] === 'done';
  const dlItem = document.getElementById('ctx-download-item');
  const dlLabel = document.getElementById('ctx-download-label');
  const dlIcon = document.getElementById('ctx-download-icon');
  if (dlItem) {
    dlItem.style.opacity = isAlreadyDL ? '.4' : '';
    dlItem.style.cursor = isAlreadyDL ? 'default' : 'pointer';
    dlItem.style.pointerEvents = isAlreadyDL ? 'none' : '';
    if (dlLabel) dlLabel.textContent = isAlreadyDL ? 'Already Downloaded' : 'Download';
    if (dlIcon) dlIcon.innerHTML = isAlreadyDL
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="var(--green)"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5v-2z"/></svg>`;
  }
  menu.classList.remove('hidden');
  document.getElementById('ctx-playlist-submenu').classList.add('hidden');
}
function regSong(song) {
  const key = song.url;
  songDataMap.set(key, { ...song });
  return key.replace(/'/g, "\\'");
}
function ctxAddToLiked() { if (ctxTargetSong) toggleLike(ctxTargetSong); closeAllMenus(); }
function ctxAddToQueue() {
  if (!ctxTargetSong) return;
  manualQueue.push({ ...ctxTargetSong });
  renderQueuePanel();
  switchRightTab('queue');
  showToast('Added to queue');
  closeAllMenus();
}
function ctxDownload() {
  if (!ctxTargetSong) return;
  const url = ctxTargetSong.url;
  if (url.startsWith('file://') || downloadQueue[url] === 'done') {
    showToast('Already downloaded'); closeAllMenus(); return;
  }
  downloadSong(url, ctxTargetSong.displayTitle || ctxTargetSong.title);
  closeAllMenus();
}
function ctxShare() {
  if (!ctxTargetSong) return;
  const song = ctxTargetSong;
  const isLocal = (song.url || '').startsWith('file://');
  try {
    if (isLocal) {
      const localPath = decodeURIComponent(song.url.replace('file:///', '').replace(/\//g, '\\'));
      navigator.clipboard.writeText(localPath);
      showToast('Local path copied: ' + localPath.split('\\').pop(), 3000);
    } else {
      const ytUrl = song.url || '';
      navigator.clipboard.writeText(ytUrl);
      showToast('YouTube link copied! Paste anywhere to share.', 3000);
    }
  } catch (_) {
    const txt = isLocal ? song.url : song.url;
    prompt('Copy this link:', txt);
  }
  closeAllMenus();
}

function checkShareLink() {
  const hash = window.location.hash || '';
  if (!hash.startsWith('#share?')) return;
  try {
    const params = new URLSearchParams(hash.slice(7));
    const song = {
      url: params.get('url') || '',
      title: params.get('title') || 'Shared Song',
      artist: params.get('artist') || '',
      thumbnail: params.get('thumb') || ''
    };
    if (!song.url) return;
    song.displayTitle = song.title.match(/^(.+?)\s*[-–—]\s*(.+)$/)?.[2] || song.title;
    shareReceivedSong = song;
    showShareReceivedModal(song);
  } catch (_) { }
}
function showShareReceivedModal(song) {
  document.getElementById('share-received-title').textContent = song.displayTitle || song.title;
  document.getElementById('share-received-artist').textContent = song.artist || '';
  const img = document.getElementById('share-received-thumb');
  if (song.thumbnail) img.src = song.thumbnail; else img.style.display = 'none';
  openModal('share-received-modal');
}
function shareReceivedPlay() {
  if (!shareReceivedSong) return;
  queue = [shareReceivedSong]; playByIndex(0);
  closeModal('share-received-modal');
}
function shareReceivedQueue() {
  if (!shareReceivedSong) return;
  manualQueue.push({ ...shareReceivedSong }); renderQueuePanel();
  showToast('Added to queue'); closeModal('share-received-modal');
}
function shareReceivedLike() {
  if (!shareReceivedSong) return;
  toggleLike(shareReceivedSong);
  showToast('Saved to Liked Songs');
}
function shareReceivedDownload() {
  if (!shareReceivedSong) return;
  downloadSong(shareReceivedSong.url, shareReceivedSong.displayTitle || shareReceivedSong.title);
}
function shareReceivedPlaylist(e) {
  if (!shareReceivedSong) return;
  ctxTargetSong = shareReceivedSong;
  showPlaylistSubmenu();
}

function showPlaylistSubmenu() {
  cancelHideSubmenu();
  const trigger = document.getElementById('ctx-playlist-trigger');
  const rect = trigger?.getBoundingClientRect() || { right: 200, top: 100 };
  const sub = document.getElementById('ctx-playlist-submenu');
  sub.style.left = Math.min(rect.right + 4, window.innerWidth - 220) + 'px';
  sub.style.top = Math.min(rect.top, window.innerHeight - 280) + 'px';
  const listEl = document.getElementById('ctx-playlist-list');
  listEl.innerHTML = playlists.length
    ? playlists.map(pl => `
        <div class="popup-item" onclick="ctxAddToPlaylist('${pl.id}')">
          <div class="popup-icon" style="background:linear-gradient(135deg,${pl.color[0]},${pl.color[1]})">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white" style="opacity:.7"><path d="M15 6H3v2h12V6z"/></svg>
          </div>
          <div class="popup-text"><div class="popup-title">${pl.name}</div></div>
        </div>`).join('')
    : '<div style="padding:8px 12px;font-size:12px;color:var(--text-muted)">No playlists yet</div>';
  sub.classList.remove('hidden');
}
function scheduleHideSubmenu() { submenuHideTimer = setTimeout(() => document.getElementById('ctx-playlist-submenu').classList.add('hidden'), 200); }
function cancelHideSubmenu() { clearTimeout(submenuHideTimer); }
function ctxAddToPlaylist(id) { if (ctxTargetSong) addSongToPlaylist(id, ctxTargetSong); closeAllMenus(); }
function ctxCreateAndAdd() { closeAllMenus(); createPlaylist(); }
function filterPlaylistSubmenu(val) {
  document.querySelectorAll('#ctx-playlist-list .popup-item').forEach(el => {
    const name = el.querySelector('.popup-title')?.textContent?.toLowerCase() || '';
    el.style.display = name.includes(val.toLowerCase()) ? '' : 'none';
  });
}

function rpAddToQueue() { if (currentSongInfo) { manualQueue.push({ ...currentSongInfo }); renderQueuePanel(); switchRightTab('queue'); showToast('Added to queue'); } }
function rpAddToPlaylist(e) {
  if (!currentSongInfo) return;
  ctxTargetSong = currentSongInfo;
  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  const sub = document.getElementById('ctx-playlist-submenu');
  const listEl = document.getElementById('ctx-playlist-list');
  const plItems = playlists.length
    ? playlists.map(pl => `
        <div class="popup-item" onclick="ctxAddToPlaylist('${pl.id}')">
          <div class="popup-icon" style="background:linear-gradient(135deg,${pl.color[0]},${pl.color[1]});flex-shrink:0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M15 6H3v2h12V6z"/></svg>
          </div>
          <div class="popup-text"><div class="popup-title">${pl.name}</div><div class="popup-desc">${pl.songs.length} songs</div></div>
        </div>`).join('')
    : '<div style="padding:8px 12px;font-size:12px;color:var(--text-muted)">No playlists yet. Create one first.</div>';
  listEl.innerHTML = plItems;
  const spaceBelow = window.innerHeight - rect.bottom;
  const menuH = Math.min(playlists.length * 44 + 80, 280);
  const top = spaceBelow < menuH ? rect.top - menuH - 4 : rect.bottom + 4;
  sub.style.left = Math.max(rect.left - 180, 10) + 'px';
  sub.style.top = Math.max(top, 60) + 'px';
  sub.classList.remove('hidden');
  e.stopPropagation();
}
function rpDownload() {
  if (!currentSongInfo) return;
  const url = currentSongInfo.url;
  if (url.startsWith('file://') || downloadQueue[url] === 'done') {
    showToast('Already downloaded locally');

    const btn = document.querySelector('.rp-action-btn[onclick="rpDownload()"]');
    if (btn) { btn.style.opacity = '.45'; btn.disabled = true; }
    return;
  }
  downloadSong(url, currentSongInfo.displayTitle || currentSongInfo.title);
}
function rpShare() { if (currentSongInfo) { ctxTargetSong = { ...currentSongInfo }; ctxShare(); } }

function isLiked(url) { return likedSongs.some(s => s.url === url); }
function toggleLikeCurrent() { if (currentSongInfo) toggleLike(currentSongInfo); }
function toggleLike(song) {
  const idx = likedSongs.findIndex(s => s.url === song.url);
  if (idx >= 0) likedSongs.splice(idx, 1); else likedSongs.unshift({ ...song, addedAt: song.addedAt || Date.now() });
  save('liked', likedSongs); updateLikeUI(song.url); updateLikedCount();

  const secAdded = document.getElementById('section-added');
  const addedCards = document.getElementById('added-cards');
  if (secAdded && addedCards) {
    if (likedSongs.length > 0) {
      secAdded.style.display = '';
      sectionData['added-cards'] = likedSongs.slice(0, 8).map(s => parseTitle(s));
      addedCards.innerHTML = sectionData['added-cards'].map((s, i) => makeMusicCard(s, i, 'added-cards')).join('');
    } else {
      secAdded.style.display = 'none';
    }
  }

  if (currentView === 'liked') renderLikedView();
}
function toggleLikeByKey(key) {
  const song = songDataMap.get(String(key));
  if (song) toggleLike(song);
}
function updateLikeUI(url) {
  const liked = isLiked(url);
  document.getElementById('heart-btn')?.classList.toggle('liked', liked);
  document.getElementById('rp-like-btn')?.classList.toggle('liked', liked);
}
function updateLikedCount() {
  const n = likedSongs.length;
  document.getElementById('liked-count').textContent = n;
  document.getElementById('liked-hero-count').textContent = n;
}
function renderLikedView() {
  const list = document.getElementById('liked-list');
  const empty = document.getElementById('liked-empty');
  if (!likedSongs.length) { list.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  queue = likedSongs.map(s => ({ ...s }));
  list.innerHTML = likedSongs.map((s, i) => makeTrackRow(s, i, 'liked')).join('');
}
function normTitle(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 40);
}
function resolveThumbnail(song) {
  if (song.thumbnail) return song.thumbnail;
  const key = normTitle(song.displayTitle || song.title);

  if (key && thumbCache[key]) return thumbCache[key];

  const all = [...likedSongs, ...recentPlayed, ...playlists.flatMap(p => p.songs || [])];
  const match = all.find(s => s.thumbnail && normTitle(s.displayTitle || s.title) === key);
  if (match) {
    if (key) { thumbCache[key] = match.thumbnail; save('thumbCache', thumbCache); }
    return match.thumbnail;
  }
  return '';
}
function resolveArtist(song) {
  if (song.artist && song.artist !== 'Downloaded') return song.artist;
  const key = normTitle(song.displayTitle || song.title);
  if (key && artistCache[key]) return artistCache[key];

  const all = [...likedSongs, ...recentPlayed, ...playlists.flatMap(p => p.songs || [])];
  const match = all.find(s => s.artist && s.artist !== 'Downloaded' && normTitle(s.displayTitle || s.title) === key);
  if (match) {
    if (key) { artistCache[key] = match.artist; save('artistCache', artistCache); }
    return match.artist;
  }
  return song.channel || '';
}
function makeTrackRow(song, i, context) {
  const dur = song.duration ? formatDuration(song.duration) : '';
  const playing = (context === 'liked' || context === 'playlist') && queueIndex === i;
  const key = regSong(song);
  const isLocalFile = song.url.startsWith('file://');
  const dl = downloadQueue[song.url];
  const isDone = isLocalFile || dl === 'done';
  const liked = isLiked(song.url);
  const dateStr = song.addedAt ? formatRelativeDate(song.addedAt) : '';
  const thumbnail = resolveThumbnail(song);

  return `
    <div class="track-row ${playing ? 'playing' : ''}"
         onclick="${context === 'liked' ? `playLikedIdx(${i})` : `playByIndex(${i})`}"
         oncontextmenu="showCtxMenu(event,'${key}')">
      <div class="track-num">${i + 1}</div>
      <div class="track-thumb-wrap">
        ${thumbnail ? `<img class="track-thumb" src="${thumbnail}" onerror="this.style.display='none'">` : ''}
        <div class="track-thumb-placeholder" style="${thumbnail ? 'display:none' : ''}">${thumbPlaceholder(song.displayTitle || song.title)}</div>
      </div>
      <div class="track-info-col">
        <div class="track-name">${song.displayTitle || song.title}</div>
        <div class="track-artist">${song.artist || ''}</div>
      </div>
      ${(context === 'playlist' || context === 'liked') ? `<div class="track-date">${dateStr}</div>` : ''}
      <div class="track-dur">${dur}</div>
      <div class="track-actions">
        <button class="track-icon-btn ${liked ? 'liked' : ''}" onclick="event.stopPropagation();toggleLikeByKey('${key}');this.classList.toggle('liked')" title="${liked ? 'Unlike' : 'Like'}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.27 2 8.5 2 5.41 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.08C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.41 22 8.5c0 3.77-3.4 6.86-8.55 11.53L12 21.35z"/></svg>
        </button>
        <button class="track-download-btn ${isDone ? 'downloaded' : ''}" ${isDone ? 'disabled style="opacity:.45;cursor:default" title="Already downloaded"' : `onclick="event.stopPropagation();downloadSong('${escJs(song.url)}','${escJs(song.displayTitle || song.title)}')"`} title="${isDone ? 'Already downloaded' : 'Download'}">
          ${isDone
      ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`
      : `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5v-2z"/></svg>`}
        </button>
        ${context === 'liked'
      ? `<button class="track-remove" onclick="event.stopPropagation();removeLiked(${i})" title="Remove from Liked"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13H5v-2h14v2z"/></svg></button>`
      : context === 'playlist'
        ? `<button class="track-remove" onclick="event.stopPropagation();removeFromPlaylist('${currentPlaylistId}','${escJs(song.url)}')" title="Remove from playlist"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13H5v-2h14v2z"/></svg></button>`
        : ''}
      </div>
    </div>`;
}
function formatRelativeDate(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function playLikedIdx(i) { queue = likedSongs.map(s => ({ ...s })); playByIndex(i); }
function playLikedAll() { if (!likedSongs.length) return; queue = likedSongs.map(s => ({ ...s })); playByIndex(0); }
function shuffleLiked() { if (!likedSongs.length) return; queue = [...likedSongs].sort(() => Math.random() - .5); playByIndex(0); }
function removeLiked(i) { likedSongs.splice(i, 1); save('liked', likedSongs); updateLikedCount(); renderLikedView(); }

const dlToasts = {};
const dlAborts = {};

function showDownloadToast(url, filename) {
  const existing = dlToasts[url];
  if (existing) return existing;
  const t = document.createElement('div');
  t.className = 'dl-toast dl-progress-toast';
  t.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--accent)"><path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5v-2z"/></svg>
    <div style="flex:1;min-width:0">
      <div style="font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${filename}</div>
      <div class="dl-progress-bar-wrap"><div class="dl-progress-bar-fill" style="width:0%"></div></div>
      <div class="dl-progress-label">Starting…</div>
    </div>
    <button onclick="cancelDownload('${url}')" title="Cancel" style="background:none;border:none;color:#ff5060;cursor:pointer;font-size:16px;line-height:1;padding:0 4px;flex-shrink:0">✕</button>`;
  document.body.appendChild(t);
  dlToasts[url] = t;
  return t;
}

function updateDownloadToast(data) {
  const t = dlToasts[data.filename] || dlToasts[Object.keys(dlToasts).find(k => dlToasts[k])];
  if (!t) return;
  const bar = t.querySelector('.dl-progress-bar-fill');
  const label = t.querySelector('.dl-progress-label');
  if (data.done) {
    if (bar) bar.style.width = '100%';
    if (label) label.textContent = '✔ Saved to Downloads/Sonix/Music';
    setTimeout(() => { t.remove(); }, 2500);
    return;
  }
  const pctStr = data.pct >= 0 ? `${data.pct}%` : '';
  const mbStr = data.tot ? `${data.mb} / ${data.tot} MB` : `${data.mb} MB`;
  if (bar) bar.style.width = (data.pct >= 0 ? data.pct : 50) + '%';
  if (label) label.textContent = [pctStr, mbStr].filter(Boolean).join('  ·  ');
}

if (window.api.onDownloadProgress) {
  window.api.onDownloadProgress((data) => {
    const matchKey = Object.keys(dlToasts).find(k => {
      const t = dlToasts[k]; return t && t.querySelector('div')?.textContent?.includes(data.filename);
    });
    const t = matchKey ? dlToasts[matchKey] : null;
    if (!t) return;
    updateDownloadToast(data);
  });
}

async function downloadSong(url, title) {
  if (downloadQueue[url] === 'pending' || downloadQueue[url] === 'done') {
    showToast('Already downloaded');
    return;
  }
  downloadQueue[url] = 'pending';
  const filename = (title || 'song').replace(/[\\/:*?"<>|]/g, '_') + '.m4a';
  const toast = showDownloadToast(url, filename);
  const abort = new AbortController();
  dlAborts[url] = abort;
  let progressHandler = null;
  if (window.api.onDownloadProgress) {
    progressHandler = (data) => {
      if (data.filename !== filename) return;
      const bar = toast.querySelector('.dl-progress-bar-fill');
      const label = toast.querySelector('.dl-progress-label');
      if (data.done) {
        if (bar) bar.style.width = '100%';
        if (label) label.textContent = '✔ Saved to Downloads/Sonix/Music';
        setTimeout(() => { toast.remove(); delete dlToasts[url]; delete dlAborts[url]; }, 2500);
        loadRecentlyDownloaded();
        renderOfflineLib();
        return;
      }
      if (abort.signal.aborted) return;
      const pctStr = data.pct >= 0 ? `${data.pct}%` : '';
      const mbStr = data.tot ? `${data.mb} / ${data.tot} MB` : `${data.mb} MB`;
      if (bar) bar.style.width = (data.pct >= 0 ? data.pct : 50) + '%';
      if (label) label.textContent = [pctStr, mbStr].filter(Boolean).join('  ·  ');
    };
    window.api.onDownloadProgress(progressHandler);
  }
  try {
    if (!window.api.downloadSong) throw new Error('Download not available');
    const result = await window.api.downloadSong({ videoUrl: url, filename });
    if (abort.signal.aborted) return;
    if (result.ok) {
      downloadQueue[url] = 'done';
      setTimeout(() => { if (dlToasts[url]) { dlToasts[url].remove(); delete dlToasts[url]; } delete dlAborts[url]; }, 500);

      if (currentSongInfo && currentSongInfo.url === url) {
        const rpDlBtn = document.querySelector('.rp-action-btn[onclick="rpDownload()"]');
        if (rpDlBtn) { rpDlBtn.disabled = true; rpDlBtn.style.opacity = '.4'; rpDlBtn.querySelector('span').textContent = 'Downloaded'; }
      }

      if (currentView === 'liked') renderLikedView();
      else if (currentView === 'playlist' && currentPlaylistId) openPlaylist(currentPlaylistId);
    } else {
      throw new Error(result.error || 'Download failed');
    }
  } catch (e) {
    if (abort.signal.aborted) return;
    downloadQueue[url] = 'error';
    toast.remove(); delete dlToasts[url]; delete dlAborts[url];
    showToast('Download failed: ' + e.message);
  }
  renderLikedView();
}
function cancelDownload(url) {
  const abort = dlAborts[url];
  if (abort) { abort.abort(); delete dlAborts[url]; }
  downloadQueue[url] = 'cancelled';
  const toast = dlToasts[url];
  if (toast) {
    const label = toast.querySelector('.dl-progress-label');
    if (label) label.textContent = 'Cancelled';
    setTimeout(() => { toast.remove(); delete dlToasts[url]; }, 1200);
  }
  showToast('Download cancelled');
}
function downloadAllLiked() {
  if (!likedSongs.length) return;
  showConfirm(
    `Download all ${likedSongs.length} liked songs?`,
    'They will be saved to your Downloads/Sonix/Music folder.',
    () => likedSongs.forEach(s => downloadSong(s.url, s.displayTitle || s.title))
  );
}

function addToRecent(song) {

  if (song.thumbnail) {
    const key = normTitle(song.displayTitle || song.title);
    if (key && !thumbCache[key]) { thumbCache[key] = song.thumbnail; save('thumbCache', thumbCache); }
  }

  if (song.artist && song.artist !== 'Downloaded') {
    const key = normTitle(song.displayTitle || song.title);
    if (key && !artistCache[key]) { artistCache[key] = song.artist; save('artistCache', artistCache); }
  }

  const thumb = song.thumbnail || resolveThumbnail(song);
  const entry = { ...song, thumbnail: thumb };
  recentPlayed = recentPlayed.filter(s => s.url !== entry.url && normTitle(s.displayTitle || s.title) !== normTitle(entry.displayTitle || entry.title));
  recentPlayed.unshift(entry);
  if (recentPlayed.length > 20) recentPlayed = recentPlayed.slice(0, 20);
  save('recent', recentPlayed);
  renderRecentLib(); renderRecentSection();
  const likedEntry = likedSongs.find(s => s.url === entry.url);
  if (likedEntry && !likedEntry.thumbnail && thumb) {
    likedEntry.thumbnail = thumb;
    save('liked', likedSongs);
  }
}
function clearHistory() {
  recentPlayed = [];
  save('recent', recentPlayed);
  renderRecentLib();
  document.getElementById('section-recent').style.display = 'none';
  showToast('History cleared');
}
function renderRecentLib() {
  const el = document.getElementById('recent-lib-items'); if (!el) return;
  el.innerHTML = recentPlayed.slice(0, 5).map((song, i) => {
    const key = regSong(song);
    const thumb = resolveThumbnail(song);
    const songArtist = resolveArtist(song);
    return `
    <div class="lib-item" onclick="libItemClick(event,${i})" oncontextmenu="showCtxMenu(event,'${key}')">
      <div class="lib-item-icon" style="overflow:hidden;background:var(--bg-elevated)">
        ${thumb
        ? `<img src="${thumb}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:900;color:rgba(255,255,255,.2)">${(song.displayTitle || song.title || '?')[0]}</div>`}
      </div>
      <div class="lib-item-info">
        <div class="lib-item-name">${song.displayTitle || song.title}</div>
        <div class="lib-item-meta">${songArtist || 'Song'}</div>
      </div>
    </div>`;
  }).join('');
}
function libItemClick(e, i) {
  const song = recentPlayed[i];
  if (currentSongInfo && song.url === currentSongInfo.url) { switchToNowPlaying(); return; }
  playFromRecent(i);
}
function renderRecentSection() {
  const section = document.getElementById('section-recent');
  const container = document.getElementById('recent-cards');
  if (!recentPlayed.length) { section.style.display = 'none'; return; }
  section.style.display = '';
  sectionData['recent-cards'] = recentPlayed.slice(0, 8);
  container.innerHTML = sectionData['recent-cards'].map((s, i) => makeMusicCard(s, i, 'recent-cards')).join('');
}
function playFromRecent(i) { queue = recentPlayed.map(s => ({ ...s })); playByIndex(i); }

function renderArtistLib() {
  const el = document.getElementById('artist-lib-items');
  if (!el || !savedArtists.length) return;
  el.innerHTML = savedArtists.map(a => `
    <div class="lib-item">
      <div class="lib-item-icon" style="background:var(--bg-elevated);border-radius:50%;overflow:hidden">
        ${a.thumbnail ? `<img src="${a.thumbnail}" style="width:100%;height:100%;object-fit:cover">`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:rgba(255,255,255,.2)">${a.name[0]}</div>`}
      </div>
      <div class="lib-item-info">
        <div class="lib-item-name">${a.name}</div>
        <div class="lib-item-meta">Artist</div>
      </div>
    </div>`).join('');
}

async function loadHomeSection(query, id) {
  const c = document.getElementById(id); if (!c) return;
  const cacheKey = 'sonix_home_v2_' + id;
  const cached = localStorage.getItem(cacheKey);

  if (cached) {
    try {
      const songs = JSON.parse(cached);
      sectionData[id] = songs;
      c.innerHTML = songs.map((s, i) => makeMusicCard(s, i, id)).join('');
    } catch (_) { }
  }

  try {
    const r = await window.api.search(query);
    if (!r || !r.length) {
      if (!cached) c.innerHTML = '<span class="cards-loading">Nothing found</span>';
      return;
    }
    const songs = r.slice(0, 8).map(s => parseTitle(s));
    sectionData[id] = songs;
    c.innerHTML = songs.map((s, i) => makeMusicCard(s, i, id)).join('');
    localStorage.setItem(cacheKey, JSON.stringify(songs));
  } catch (e) {
    if (!cached) c.innerHTML = '<span class="cards-loading">Failed to load</span>';
  }
}
async function loadArtistSection() {
  const c = document.getElementById('artist-cards');
  const artists = ['Bruno Mars', 'Taylor Swift', 'Ed Sheeran', 'Adele', 'The Weeknd', 'Billie Eilish', 'Coldplay', 'Ariana Grande'];
  const colors = ['#1e3a5f', '#5c1a5e', '#1a4a2e', '#5e3a1a', '#1a1a5e', '#3d1a1a', '#1a3d3d', '#5e1a3d'];
  c.innerHTML = artists.map((name, i) => `
    <div class="music-card" id="artist-card-${i}" onclick="searchArtist('${name}')">
      <div class="card-thumb-wrap" style="border-radius:50%;overflow:hidden">
        <img class="card-thumb" id="artist-img-${i}" src="" style="display:none;border-radius:50%;object-fit:cover" loading="lazy">
        <div class="card-thumb-placeholder" id="artist-ph-${i}" style="font-size:38px;color:rgba(255,255,255,.35);background:${colors[i]};border-radius:50%">${name[0]}</div>
        <button class="card-play-btn" onclick="event.stopPropagation();searchArtist('${name}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
        </button>
      </div>
      <div class="card-title" style="text-align:center">${name}</div>
      <div class="card-sub" style="text-align:center">Artist</div>
    </div>`).join('');
  artists.forEach(async (name, i) => {
    const cacheKey = 'sonix_artist_thumb_' + name;
    const cachedUrl = localStorage.getItem(cacheKey);
    if (cachedUrl) {
      const img = document.getElementById(`artist-img-${i}`);
      const ph = document.getElementById(`artist-ph-${i}`);
      if (img && ph) { img.src = cachedUrl; img.style.display = ''; ph.style.display = 'none'; }
    }

    try {
      const res = await fetch(`https://www.theaudiodb.com/api/v1/json/2/search.php?s=${encodeURIComponent(name)}`);
      const data = await res.json();
      const imgUrl = data?.artists?.[0]?.strArtistThumb;
      if (imgUrl && imgUrl !== cachedUrl) {
        localStorage.setItem(cacheKey, imgUrl);
        const img = document.getElementById(`artist-img-${i}`);
        const ph = document.getElementById(`artist-ph-${i}`);
        if (img && ph) { img.src = imgUrl; img.style.display = ''; ph.style.display = 'none'; }
      }
    } catch (_) { }
  });
}
function searchArtist(name) { document.getElementById('search').value = name; doSearch(); }

async function loadRecentlyDownloaded() {
  const sec = document.getElementById('section-downloads');
  const c = document.getElementById('downloaded-cards');
  if (!sec || !c) return;
  try {
    const files = await window.api.getOfflineSongs();
    if (!files || !files.length) { sec.style.display = 'none'; return; }
    sec.style.display = '';
    const knownSongs = [...likedSongs, ...recentPlayed, ...playlists.flatMap(p => p.songs || [])];
    const SHOW = 8;
    const shown = files.slice(0, SHOW);
    const extra = files.length - SHOW;
    c.innerHTML = shown.map(f => {
      const name = f.filename.replace(/\.(m4a|webm|mp3|opus)$/i, '');
      const mb = (f.size / 1048576).toFixed(1);
      const safePath = f.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const safeNameQ = name.replace(/'/g, "\\'");
      const fileUrl = 'file:///' + f.path.replace(/\\/g, '/');
      const isFileMatch = s => {
        const exp = ((s.displayTitle || s.title) || '').replace(/[\\/:*?"<>|]/g, '_');
        return name === exp || (exp.length >= 8 && name.startsWith(exp.substring(0, Math.min(20, exp.length))));
      };
      const match =
        knownSongs.find(s => !s.url.startsWith('file://') && s.thumbnail && s.artist && isFileMatch(s)) ||
        knownSongs.find(s => s.thumbnail && isFileMatch(s)) ||
        knownSongs.find(s => isFileMatch(s)) || null;
      const song = match ? { ...match, url: fileUrl } : { url: fileUrl, title: name, displayTitle: name, artist: 'Downloaded', thumbnail: '' };
      const thumb = song.thumbnail || resolveThumbnail({ displayTitle: name, title: name });
      const songArtist = resolveArtist({ displayTitle: name, title: name, artist: song.artist });
      if (songArtist && songArtist !== 'Downloaded') song.artist = songArtist;
      const key = regSong(song);

      if (!thumb || !songArtist || songArtist === 'Downloaded') queueMetadataFetch(name);

      return `
        <div class="music-card" onclick="playOfflineSong('${safePath}','${safeNameQ}')" oncontextmenu="showCtxMenu(event,'${key}')">
          <div class="card-thumb-wrap">
            ${thumb
          ? `<img class="card-thumb" src="${thumb}" loading="lazy" onerror="this.style.display='none'">`
          : `<div class="card-thumb-placeholder" style="background:linear-gradient(135deg,#1e1a4a,#2a1666)"><svg width="36" height="36" viewBox="0 0 24 24" fill="#a78bff"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>`}
            <span class="card-duration">${mb}MB</span>
          </div>
          <div class="card-title">${name}</div>
          <div class="card-sub">${songArtist || 'Downloaded'}</div>
        </div>`;
    }).join('')
      + (extra > 0 ? `
      <div class="music-card" onclick="showAllDownloaded()" style="opacity:.7">
        <div class="card-thumb-wrap"><div class="card-thumb-placeholder" style="background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;color:rgba(255,255,255,.3)">+${extra}</div></div>
        <div class="card-title">More Songs</div>
        <div class="card-sub">View all</div>
      </div>` : '');
  } catch (_) { }
}

function makeMusicCard(song, i, context) {
  const dur = song.duration ? formatDuration(song.duration) : '';
  const t = resolveThumbnail(song);
  const songArtist = resolveArtist(song);
  const key = regSong(song);
  return `
    <div class="music-card" onclick="playCardSong('${context}',${i})" oncontextmenu="showCtxMenu(event,'${key}')">
      <div class="card-thumb-wrap">
        ${t ? `<img class="card-thumb" src="${t}" loading="lazy" onerror="this.style.display='none'">` : ''}
        <div class="card-thumb-placeholder" style="${t ? 'display:none' : ''}">
          ${thumbPlaceholder(song.displayTitle || song.title)}
        </div>
        ${dur ? `<span class="card-duration">${dur}</span>` : ''}
        <button class="card-play-btn" onclick="event.stopPropagation();playCardSong('${context}',${i})">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
        </button>
      </div>
      <div class="card-title">${song.displayTitle || song.title}</div>
      <div class="card-sub">${songArtist || ''}</div>
    </div>`;
}

let metadataQueue = [];
let fetchingMetadata = false;

function queueMetadataFetch(title) {
  const key = normTitle(title);
  if (!key || thumbCache[key]) return;
  if (!metadataQueue.includes(title)) metadataQueue.push(title);
  if (!fetchingMetadata) processMetadataQueue();
}

async function processMetadataQueue() {
  if (metadataQueue.length === 0) { fetchingMetadata = false; return; }
  fetchingMetadata = true;
  const title = metadataQueue.shift();
  try {
    const results = await window.api.search(title);
    if (results && results.length > 0) {
      const parsed = parseTitle(results[0]);
      const key = normTitle(title);
      let updated = false;
      if (parsed.thumbnail) { thumbCache[key] = parsed.thumbnail; updated = true; }
      if (parsed.artist) { artistCache[key] = parsed.artist; updated = true; }
      if (updated) {
        save('thumbCache', thumbCache);
        save('artistCache', artistCache);
        renderOfflineLib();
        loadRecentlyDownloaded();
      }
    }
  } catch (e) { }
  setTimeout(processMetadataQueue, 1500);
}

function thumbPlaceholder(title) {
  const ch = (title || '?')[0].toUpperCase();
  const colors = ['#6c47ff', '#ff47a3', '#47b4ff', '#47ffa3', '#ffa347', '#a347ff', '#ff6b47'];
  const col = colors[ch.charCodeAt(0) % colors.length];
  return `<div style="width:100%;height:100%;background:${col};display:flex;align-items:center;justify-content:center;font-size:38px;font-weight:900;color:rgba(255,255,255,.5);border-radius:inherit">${ch}</div>`;
}

async function playCardSong(context, idx) {
  let src = [];
  if (context === 'results') src = queue;
  else if (context === 'recent-cards') src = recentPlayed;
  else if (context === 'liked' || context === 'added-cards') src = likedSongs;
  else if (sectionData[context]) src = sectionData[context];
  if (!src.length) return;
  queue = src.map(s => ({ ...s })); await playByIndex(idx);
}

function parseTitle(song) {
  const m = song.title.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  const artist = m ? m[1].trim() : (song.channel || '');
  const displayTitle = m ? m[2].trim() : song.title;
  return { ...song, artist, displayTitle };
}

let _searchDebounce = null;
function onSearchInput(val) {
  if (!val.trim()) { clearTimeout(_searchDebounce); navigate('home'); return; }
  clearTimeout(_searchDebounce);
  _searchDebounce = setTimeout(() => doSearch(), 600);
}
function handleKey(e) { if (e.key === 'Enter') { clearTimeout(_searchDebounce); doSearch(); } }

async function doSearch() {
  const query = document.getElementById('search').value.trim();
  if (!query) return;
  navigate('search');
  document.getElementById('search-heading').textContent = `Results for "${query}"`;
  document.getElementById('results').innerHTML = '';
  document.getElementById('loading').classList.remove('hidden');
  queue = []; queueIndex = -1;
  const results = await window.api.search(query);
  document.getElementById('loading').classList.add('hidden');
  if (!results || !results.length) {
    document.getElementById('results').innerHTML = `<p style="color:var(--text-sub);grid-column:1/-1">No results for "<strong>${query}</strong>"</p>`;
    return;
  }
  queue = results.map(r => parseTitle(r));
  let cacheUpdated = false;
  queue.forEach(s => {
    const key = normTitle(s.displayTitle || s.title);
    if (!key) return;
    if (s.thumbnail && !thumbCache[key]) { thumbCache[key] = s.thumbnail; cacheUpdated = true; }
    if (s.artist && !artistCache[key]) { artistCache[key] = s.artist; cacheUpdated = true; }
  });
  if (cacheUpdated) {
    save('thumbCache', thumbCache);
    save('artistCache', artistCache);
    renderOfflineLib();
    loadRecentlyDownloaded();
  }
  renderSearchQueue();
}
let searchResults = [];
function renderSearchQueue() {
  const c = document.getElementById('results');
  searchResults = [...queue];
  c.innerHTML = searchResults.map((song, idx) => {
    const dur = song.duration ? formatDuration(song.duration) : '';
    const t = song.thumbnail;
    const key = regSong(song);
    return `
      <div class="music-card" data-search-index="${idx}"
           onclick="playSearchSong(${idx})" oncontextmenu="showCtxMenu(event,'${key}')">
        <div class="card-thumb-wrap">
          ${t ? `<img class="card-thumb" src="${t}" loading="lazy" onerror="this.style.display='none'">` : ''}
          <div class="card-thumb-placeholder" style="${t ? 'display:none' : ''}">
            ${thumbPlaceholder(song.displayTitle)}
          </div>
          ${dur ? `<span class="card-duration">${dur}</span>` : ''}
          <button class="card-play-btn" onclick="event.stopPropagation();playSearchSong(${idx})">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
        <div class="card-title">${song.displayTitle}</div>
        <div class="card-sub">${song.artist}</div>
      </div>`;
  }).join('');
}
function playSearchSong(idx) {
  const song = searchResults[idx];
  if (!song) return;
  queue = [song];
  queueIndex = 0;
  document.querySelectorAll('[data-search-index]').forEach(el => el.classList.remove('active-card'));
  document.querySelector(`[data-search-index="${idx}"]`)?.classList.add('active-card');
  play(song.url, song.title, song.thumbnail, 0, song.artist, song.displayTitle);
}

function removeBrokenSong(idx) {
  if (idx < 0 || idx >= queue.length) return;
  queue.splice(idx, 1);
  if (idx < queueIndex) queueIndex--;
  else if (idx === queueIndex) queueIndex = Math.min(queueIndex, queue.length - 1);
  renderSearchQueue(); renderQueuePanel();
  if (queue.length > 0 && idx <= queueIndex) playByIndex(queueIndex);
}

function toggleShuffle() {
  isShuffled = !isShuffled;
  document.getElementById('shuffle-btn').classList.toggle('active', isShuffled);
  if (isShuffled && queue.length > 1) {
    const cur = queue[queueIndex];
    const rest = queue.filter((_, i) => i !== queueIndex).sort(() => Math.random() - .5);
    queue = [cur, ...rest]; queueIndex = 0;
  }
}
function toggleRepeat() {
  repeatMode = (repeatMode + 1) % 3;
  const btn = document.getElementById('repeat-btn');
  btn.classList.toggle('active', repeatMode > 0);
  btn.title = ['Repeat Off', 'Repeat All', 'Repeat One'][repeatMode];
  btn.innerHTML = repeatMode === 2
    ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2v-6h-1l-2 1v1h1.5v4H13z"/></svg>`
    : `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`;
}

async function playByIndex(idx) {
  if (idx < 0 || idx >= queue.length) return;
  queueIndex = idx;
  document.querySelectorAll('[data-index]').forEach(c => c.classList.remove('active-card'));
  const active = document.querySelector(`[data-index="${idx}"]`);
  if (active) { active.classList.add('active-card'); active.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  await play(queue[idx].url, queue[idx].title, queue[idx].thumbnail, idx, queue[idx].artist, queue[idx].displayTitle);
}
async function playNext() {
  if (!queue.length) return;
  if (repeatMode === 2) { if (audio) { audio.currentTime = 0; audio.play(); } return; }
  if (manualQueue.length > 0) {
    const next = manualQueue.shift();
    queue = [next, ...queue.slice(queueIndex + 1)];
    queueIndex = 0;
    renderQueuePanel();
    await play(next.url, next.title, next.thumbnail, 0, next.artist, next.displayTitle);
    return;
  }
  const nextIdx = queueIndex + 1;
  if (nextIdx >= queue.length) {
    if (repeatMode === 1) { await playByIndex(0); }
    else { isPlaying = false; setPlayPauseIcon(false); setProgress(100); setStatus(''); }
    return;
  }
  await playByIndex(nextIdx);
}
async function playPrev() {
  if (!queue.length) return;
  if (audio && audio.currentTime > 3) { audio.currentTime = 0; audio.play(); return; }
  if (queueIndex <= 0) { if (audio) { audio.currentTime = 0; audio.play(); } return; }
  await playByIndex(queueIndex - 1);
}

function renderQueuePanel() {
  const list = document.getElementById('queue-list');
  const empty = document.getElementById('queue-empty');
  const clearBtn = document.getElementById('queue-clear-btn');
  const tabQueue = document.getElementById('tab-queue');

  if (!manualQueue.length) {
    list.innerHTML = '';
    empty.style.display = 'flex';
    if (clearBtn) clearBtn.style.display = 'none';
    if (tabQueue) {
      if (tabQueue.classList.contains('active')) switchRightTab('nowplaying');
      tabQueue.style.display = 'none';
    }
    return;
  }
  empty.style.display = 'none';
  if (clearBtn) clearBtn.style.display = '';
  if (tabQueue) tabQueue.style.display = '';
  list.innerHTML = manualQueue.map((song, i) => `
    <div class="queue-item" onclick="playManualQueueSong(${i})" style="cursor:pointer">
      <div class="queue-thumb-wrap">
        ${song.thumbnail ? `<img class="queue-thumb" src="${song.thumbnail}" onerror="this.style.display='none'">` : ''}
        <div class="queue-thumb-placeholder" style="${song.thumbnail ? 'display:none' : ''}">
          ${thumbPlaceholder(song.displayTitle || song.title)}
        </div>
      </div>
      <div class="queue-info">
        <div class="queue-title">${song.displayTitle || song.title}</div>
        <div class="queue-artist">${song.artist || ''}</div>
      </div>
      <div class="queue-dur">${song.duration ? formatDuration(song.duration) : ''}</div>
      <button class="queue-remove" onclick="event.stopPropagation(); removeFromQueue(${i})" title="Remove">✕</button>
    </div>`).join('');
}
function removeFromQueue(i) { manualQueue.splice(i, 1); renderQueuePanel(); }

async function playManualQueueSong(i) {
  const song = manualQueue[i];
  if (!song) return;
  manualQueue.splice(0, i + 1);
  queue = [song, ...queue.slice(queueIndex + 1)];
  queueIndex = 0;
  renderQueuePanel();
  await play(song.url, song.title, song.thumbnail, 0, song.artist, song.displayTitle);
}
function clearQueue() { manualQueue = []; renderQueuePanel(); }

async function fetchLyrics(title, artist) {
  try {
    const q = encodeURIComponent((artist + ' ' + title).trim().replace(/\(.+?\)/g, '').trim());
    const res = await fetch('https://lrclib.net/api/search?q=' + q, { headers: { 'Lrclib-Client': 'Sonix/1.0' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.length) return null;
    const best = data.find(d => d.syncedLyrics) || data[0];
    if (best && best.syncedLyrics) {
      const lines = best.syncedLyrics.split('\n').map(line => {
        const m = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
        if (!m) return null;
        return { time: parseInt(m[1]) * 60 + parseFloat(m[2]), text: m[3].trim() || '♪' };
      }).filter(Boolean);
      if (lines.length > 0) return lines;
    }
    if (best && best.plainLyrics) {
      const lines = best.plainLyrics.split('\n').filter(l => l.trim());
      return lines.map((text, i) => ({ time: i * 5, text: text.trim() || '♪' }));
    }
    return null;
  } catch (e) { console.warn('Lyrics:', e.message); return null; }
}
function startLyricsSync() {
  clearInterval(lyricsInterval);
  if (!lyricsData.length || !audio) return;
  const snapToken = playToken;
  const snapAudio = audio;
  lyricsInterval = setInterval(() => {
    if (playToken !== snapToken || audio !== snapAudio) { clearInterval(lyricsInterval); return; }
    const t = snapAudio.currentTime;
    let active = 0;
    for (let i = 0; i < lyricsData.length; i++) { if (t >= lyricsData[i].time) active = i; }
    document.querySelectorAll('.lyric-line-sm').forEach((el, i) => {
      const was = el.classList.contains('active');
      el.classList.toggle('active', i === active);
      if (i === active && !was) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    document.querySelectorAll('.lyric-line-full').forEach((el, i) => {
      const was = el.classList.contains('active');
      el.classList.toggle('active', i === active);
      if (i === active && !was) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, 100);
}
async function renderLyrics(title, artist, token) {
  const section = document.getElementById('rp-lyrics-section');
  const linesEl = document.getElementById('lyrics-lines');
  const placeholder = document.getElementById('lyrics-placeholder-small');
  section.style.display = '';
  linesEl.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:4px">Loading lyrics…</div>';
  placeholder.style.display = 'none';
  lyricsData = await fetchLyrics(title, artist) || [];
  if (token !== undefined && token !== playToken) return;
  if (!lyricsData.length) {
    linesEl.innerHTML = ''; placeholder.style.display = 'flex'; return;
  }
  linesEl.innerHTML = lyricsData.map((line, i) =>
    `<div class="lyric-line-sm${i === 0 ? ' active' : ''}" onclick="seekToLyric(${line.time})">${line.text}</div>`
  ).join('');
  startLyricsSync();
}
function seekToLyric(t) { if (audio) audio.currentTime = t; }

async function play(url, rawTitle, thumbnail, songIdx, preArtist, preDisplay) {
  const myToken = ++playToken;
  const isStale = () => myToken !== playToken;
  const m = rawTitle.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  let artist = preArtist !== undefined ? preArtist : (m ? m[1].trim() : '');
  const displayTitle = preDisplay !== undefined ? preDisplay : (m ? m[2].trim() : rawTitle);

  if (!artist || artist === 'Downloaded') {
    artist = resolveArtist({ displayTitle, title: rawTitle, channel: '' });
  }

  currentSongInfo = { url, title: rawTitle, artist, displayTitle, thumbnail };

  document.getElementById('title').textContent = displayTitle;
  document.getElementById('player-artist').textContent = artist;
  const thumb = document.getElementById('thumb');
  const thumbPlac = document.getElementById('player-thumb-placeholder');
  if (thumbnail) { thumb.src = thumbnail; thumb.classList.remove('hidden'); thumbPlac.style.display = 'none'; }
  else { thumb.classList.add('hidden'); thumbPlac.style.display = 'flex'; }

  const rpArt = document.getElementById('rp-art');
  const rpIdle = document.getElementById('rp-idle-banner');
  if (thumbnail) { rpArt.src = thumbnail; rpArt.classList.remove('hidden'); rpIdle.style.display = 'none'; }
  else { rpArt.classList.add('hidden'); rpIdle.style.display = ''; }
  document.getElementById('rp-title').textContent = displayTitle;
  document.getElementById('rp-artist').textContent = artist || 'Unknown Artist';
  document.getElementById('rp-actions').style.display = 'flex';

  const rpDlBtn = document.querySelector('.rp-action-btn[onclick="rpDownload()"]');
  if (rpDlBtn) {
    const isAlreadyDL = url.startsWith('file://') || downloadQueue[url] === 'done';
    rpDlBtn.disabled = isAlreadyDL;
    rpDlBtn.style.opacity = isAlreadyDL ? '.4' : '';
    rpDlBtn.title = isAlreadyDL ? 'Already downloaded' : 'Download';
    rpDlBtn.querySelector('span').textContent = isAlreadyDL ? 'Downloaded' : 'Download';
  }

  const aboutEl = document.getElementById('rp-about'); aboutEl.style.display = '';
  document.getElementById('rp-artist-name').textContent = artist || 'Unknown Artist';
  document.getElementById('rp-artist-desc').textContent = artist ? `Listen to ${artist} on Sonix.` : 'Music on Sonix.';
  const rpImg = document.getElementById('rp-artist-img');
  const rpPlac = document.getElementById('rp-artist-placeholder');
  if (thumbnail) { rpImg.src = thumbnail; rpImg.style.display = 'block'; rpPlac.style.display = 'none'; }
  else { rpImg.style.display = 'none'; rpPlac.style.display = 'flex'; }

  const credEl = document.getElementById('rp-credits'); credEl.style.display = '';
  document.getElementById('rp-credits-list').innerHTML = `
    <div class="rp-credit"><div class="rp-credit-role">Main Artist</div><div class="rp-credit-name">${artist || 'Unknown'}</div></div>
    <div class="rp-credit"><div class="rp-credit-role">Song</div><div class="rp-credit-name">${displayTitle}</div></div>
  `;

  setPlayPauseIcon(false); setProgress(0);
  document.getElementById('current-time').textContent = '0:00';
  document.getElementById('total-time').textContent = '--:--';
  setStatus('🎵 Resolving…');
  updateLikeUI(url); renderQueuePanel();

  clearInterval(lyricsInterval); lyricsData = [];
  renderLyrics(displayTitle, artist, myToken);

  if (audio) { const old = audio; audio = null; old.pause(); old.removeAttribute('src'); old.load(); }
  const isLocal = url.startsWith('file://');
  const streamUrl = isLocal ? url : await window.api.getAudio(url);
  if (!isLocal && isStale()) return;
  if (!streamUrl) { setStatus('⚠ Could not resolve'); setTimeout(() => removeBrokenSong(songIdx ?? queueIndex), 1500); return; }
  setStatus('↻ Connecting…');
  const thisAudio = new Audio(streamUrl); audio = thisAudio;
  const isCurrent = () => thisAudio === audio;
  thisAudio.addEventListener('playing', () => {
    if (!isCurrent()) return; isPlaying = true; setPlayPauseIcon(true); setStatus('');
    addToRecent({ url, title: rawTitle, displayTitle, artist, thumbnail, duration: thisAudio.duration || queue[songIdx ?? queueIndex]?.duration });
    if (lyricsData.length) startLyricsSync();
  });
  thisAudio.addEventListener('waiting', () => { if (!isCurrent()) return; setStatus('↻ Buffering…'); });
  thisAudio.addEventListener('pause', () => { if (!isCurrent()) return; isPlaying = false; setPlayPauseIcon(false); if (!thisAudio.ended) setStatus(''); });
  thisAudio.addEventListener('timeupdate', () => {
    if (!isCurrent() || !thisAudio.duration) return;
    const pct = (thisAudio.currentTime / thisAudio.duration) * 100; setProgress(pct);
    document.getElementById('current-time').textContent = formatDuration(thisAudio.currentTime);
    document.getElementById('total-time').textContent = formatDuration(thisAudio.duration);
  });
  thisAudio.addEventListener('ended', () => { if (!isCurrent()) return; isPlaying = false; setPlayPauseIcon(false); setStatus(''); clearInterval(lyricsInterval); playNext(); });
  thisAudio.addEventListener('error', () => {
    if (!isCurrent()) return; const code = thisAudio.error?.code; if (code === 1) return;
    const msgs = { 2: 'Network error', 3: 'Decode error', 4: 'Unsupported' };
    setStatus('⚠ ' + (msgs[code] || 'Error') + ' — skipping');
    setTimeout(() => removeBrokenSong(songIdx ?? queueIndex), 1500);
  });
  thisAudio.play().catch(err => { if (!isCurrent()) return; setStatus('⚠ ' + err.message); });
}

function playPause() { if (!audio) return; if (audio.paused) audio.play(); else audio.pause(); }
function seek(e) {
  if (!audio || !audio.duration) return;
  const bar = document.getElementById('progress-bar');
  const rect = bar.getBoundingClientRect();
  audio.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * audio.duration;
}
function setVolume(val) { if (audio) audio.volume = parseFloat(val); }
async function loadPopular(q) { document.getElementById('search').value = q; doSearch(); }

function setPlayPauseIcon(p) {
  document.getElementById('icon-play').style.display = p ? 'none' : 'block';
  document.getElementById('icon-pause').style.display = p ? 'block' : 'none';
}
function setProgress(pct) { document.getElementById('progress').style.width = pct + '%'; }
function setStatus(msg) {
  document.getElementById('rp-status').textContent = msg;
  const ps = document.getElementById('player-status'); if (ps) ps.textContent = msg;
}
function formatDuration(s) {
  if (!s || isNaN(s)) return '0:00';
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
function escJs(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"'); }
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

let _confirmCallback = null;
function showConfirm(title, desc, onConfirm) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-desc').textContent = desc || '';
  _confirmCallback = onConfirm;
  openModal('confirm-modal');
}
function confirmOk() {
  closeModal('confirm-modal');
  if (_confirmCallback) { _confirmCallback(); _confirmCallback = null; }
}
function confirmCancel() {
  closeModal('confirm-modal');
  _confirmCallback = null;
}

let _promptCallback = null;
function showPromptModal(title, defaultVal, onConfirm) {
  document.getElementById('prompt-modal-title').textContent = title;
  const input = document.getElementById('prompt-modal-input');
  input.value = defaultVal || '';
  _promptCallback = onConfirm;
  openModal('prompt-modal');
  setTimeout(() => input.select(), 60);
}
function promptOk() {
  const val = document.getElementById('prompt-modal-input').value.trim();
  closeModal('prompt-modal');
  if (_promptCallback) { _promptCallback(val); _promptCallback = null; }
}
function promptCancel() {
  closeModal('prompt-modal');
  _promptCallback = null;
}

function showToast(msg, dur = 2800) {
  const t = document.createElement('div'); t.className = 'dl-toast';
  t.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="var(--green)"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg><span>${msg}</span>`;
  document.body.appendChild(t); setTimeout(() => t.remove(), dur);
}

async function manualCheckUpdates() {
  closeAppMenu();
  showToast('Checking for updates...');
  await checkUpdates(true);
}

async function checkUpdates(force = false) {
  const repo = "ShadowNightDev/Sonix-Music";
  const lastCheck = localStorage.getItem('sonix_last_update_check');
  const now = Date.now();

  if (!force && lastCheck && (now - parseInt(lastCheck)) < 43200000) return;

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { "User-Agent": "Sonix-App" }
    });
    if (!res.ok) {
      if (force) showToast('Failed to check for updates');
      return;
    }
    const json = await res.json();
    const latest = (json.tag_name || "").replace("v", "");
    const current = (await window.api.getAppVersion() || "1.0.0").replace("v", "");

    if (latest && current && latest !== current) {

      const verText = document.getElementById('update-version-text');
      const dlBtn = document.getElementById('update-download-btn');
      if (verText) verText.textContent = `v${current} → v${latest}`;

      const clBox = document.getElementById('updateChangelog');
      if (clBox) {
        let notes = json.body || "";
        if (notes.trim() !== "") {
          notes = notes
            .replace(/\r\n/g, "\n")
            .replace(/^\[NEW\]\s*(.*)$/gim, "<div class='changelog-item'><span class='tag new'>NEW</span>$1</div>")
            .replace(/^\[IMPROVED\]\s*(.*)$/gim, "<div class='changelog-item'><span class='tag improve'>IMPROVED</span>$1</div>")
            .replace(/^\[FIX\]\s*(.*)$/gim, "<div class='changelog-item'><span class='tag fix'>FIX</span>$1</div>")
            .replace(/^\[PERFORMANCE\]\s*(.*)$/gim, "<div class='changelog-item'><span class='tag perf'>PERF</span>$1</div>")
            .replace(/^\[UI\]\s*(.*)$/gim, "<div class='changelog-item'><span class='tag ui'>UI</span>$1</div>")
            .replace(/^\[SECURITY\]\s*(.*)$/gim, "<div class='changelog-item'><span class='tag security'>SECURITY</span>$1</div>")
            .replace(/\n/g, "<div style='height:4px'></div>");
          clBox.innerHTML = notes;
          clBox.classList.remove('hidden');
        } else {
          clBox.classList.add('hidden');
        }
      }

      if (dlBtn) dlBtn.onclick = () => { window.open(json.html_url, '_blank'); closeModal('update-modal'); };
      openModal('update-modal');

      const aboutVersion = document.getElementById('about-version');
      if (aboutVersion) {
        aboutVersion.innerHTML = `${current} &nbsp; <span onclick="window.open('${json.html_url}', '_blank')" style="color:var(--accent);cursor:pointer;background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;font-weight:700">Update to v${latest}</span>`;
      }
    } else if (force) {
      showToast('You are on the latest version!');
    }
    localStorage.setItem('sonix_last_update_check', now.toString());
  } catch (e) {
    if (force) showToast('Update check failed');
    console.error("Update check failed", e);
  }
}


document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); playPause(); }
  if (e.code === 'ArrowRight') { e.preventDefault(); playNext(); }
  if (e.code === 'ArrowLeft') { e.preventDefault(); playPrev(); }
  if (e.code === 'Escape') { collapseLyrics(); closeAllMenus();['create-playlist-modal', 'create-folder-modal', 'share-received-modal'].forEach(closeModal); }
});

window.onload = async () => {
  try {
    appSettings = await window.api.getSettings();
    document.getElementById('about-version').textContent = await window.api.getAppVersion() || "1.0.0";
  } catch (_) { }

  let cacheUpdated = false;
  [...likedSongs, ...recentPlayed, ...playlists.flatMap(p => p.songs || [])].forEach(s => {
    const key = normTitle(s.displayTitle || s.title);
    if (!key) return;
    if (s.thumbnail && !thumbCache[key]) { thumbCache[key] = s.thumbnail; cacheUpdated = true; }
    if (s.artist && s.artist !== 'Downloaded' && !artistCache[key]) { artistCache[key] = s.artist; cacheUpdated = true; }
  });
  if (cacheUpdated) { save('thumbCache', thumbCache); save('artistCache', artistCache); }
  updateLikedCount();
  renderRecentLib(); renderRecentSection();
  renderArtistLib(); renderPlaylistLib(); renderFolderLib();
  renderOfflineLib();
  renderHomeShortcuts();

  loadHomeSection('top hits 2025', 'popular-cards');
  loadHomeSection('best albums playlist 2024', 'album-cards');
  loadArtistSection();
  loadRecentlyDownloaded();
  if (likedSongs.length > 0) {
    document.getElementById('section-added').style.display = '';
    sectionData['added-cards'] = likedSongs.slice(0, 8).map(s => parseTitle(s));
    document.getElementById('added-cards').innerHTML = sectionData['added-cards'].map((s, i) => makeMusicCard(s, i, 'added-cards')).join('');
  }
  checkShareLink();
  renderQueuePanel();
  checkUpdates();
  document.getElementById('search').focus();
};


