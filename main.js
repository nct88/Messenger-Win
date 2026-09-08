// ============================================================
//  Messlỏ — Ứng dụng Messenger Desktop cho Windows
//  Nhân: Chromium (Google Chrome)
//  Tác giả: TruongIT
// ============================================================

const {
  app,
  BrowserWindow,
  BrowserView,
  shell,
  session,
  Menu,
  MenuItem,
  Tray,
  globalShortcut,
  ipcMain,
  nativeImage,
  nativeTheme,
  dialog,
} = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const https = require('https');

// ============================================================
//  HỆ THỐNG DOWNLOAD
// ============================================================
let activeDownloads = new Map(); // id -> { item, filename, savePath, received, total }
let downloadCounter = 0;

// ============================================================
//  CẤU HÌNH CHUNG
// ============================================================
const MESSENGER_URL = 'https://www.facebook.com/messages';
const APP_ID = 'com.messenger.premium';

// Dự phòng khi chưa có cache hoặc mọi lần fetch bản mới đều lỗi (offline,
// API đổi định dạng...). Nên tự tay cập nhật vài tháng/lần nếu cơ chế tự
// động bên dưới ngừng hoạt động lâu dài.
const USER_AGENT_FALLBACK =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.196 Safari/537.36 Edg/149.0.4022.62';
// Giá trị THỰC TẾ dùng khi load/loadURL/setUserAgent — nạp từ cache lúc khởi
// động, có thể bị refreshUserAgent() ghi đè ngầm giữa phiên (session mở SAU
// thời điểm ghi đè sẽ nhận UA mới).
let USER_AGENT = USER_AGENT_FALLBACK;

// ============================================================
//  TỰ ĐỘNG CẬP NHẬT USER-AGENT (Chrome/Edge bản Stable mới nhất)
// ============================================================
const UA_CACHE_PATH = path.join(app.getPath('userData'), 'ua_cache.json');
const UA_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày mới fetch lại
const VERSION_PATTERN = /^\d+\.\d+\.\d+\.\d+$/;
const UA_PATTERN = /^Mozilla\/5\.0 \(Windows NT 10\.0; Win64; x64\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/\d+\.\d+\.\d+\.\d+ Safari\/537\.36 Edg\/\d+\.\d+\.\d+\.\d+$/;

function buildUserAgent(chromeVersion, edgeVersion) {
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36 Edg/${edgeVersion}`;
}

// Client Hints (Sec-CH-UA...) do Chromium tự sinh dựa trên ENGINE THẬT (vd
// Electron 29 = Chromium 122), KHÔNG dựa theo chuỗi User-Agent đã giả lập —
// nên nếu không sửa, sec-ch-ua sẽ lộ ra "Chromium 122" trong khi User-Agent
// lại khai Chrome/Edge bản mới hơn nhiều. Sự mâu thuẫn 2 tín hiệu này chính
// là dấu hiệu các dịch vụ như Google dùng để phát hiện trình duyệt giả mạo.
function buildClientHints(userAgent) {
  const chrome = userAgent.match(/Chrome\/(\d+)\.(\d+\.\d+\.\d+)/);
  const edge = userAgent.match(/Edg\/(\d+)\.(\d+\.\d+\.\d+)/);
  const chromeMajor = chrome ? chrome[1] : '150';
  const chromeFull = chrome ? `${chrome[1]}.${chrome[2]}` : '150.0.7871.47';
  const edgeMajor = edge ? edge[1] : '149';
  const edgeFull = edge ? `${edge[1]}.${edge[2]}` : '149.0.4022.98';
  return {
    'sec-ch-ua': `"Not)A;Brand";v="99", "Microsoft Edge";v="${edgeMajor}", "Chromium";v="${chromeMajor}"`,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-ch-ua-platform-version': '"19.0.0"',
    'sec-ch-ua-full-version': `"${edgeFull}"`,
    'sec-ch-ua-full-version-list': `"Not)A;Brand";v="99.0.0.0", "Microsoft Edge";v="${edgeFull}", "Chromium";v="${chromeFull}"`,
  };
}

// Đọc cache LOCAL đồng bộ lúc khởi động — không chờ mạng, không chặn startup.
function loadCachedUserAgent() {
  try {
    const cache = JSON.parse(fs.readFileSync(UA_CACHE_PATH, 'utf8'));
    if (cache && typeof cache.userAgent === 'string' && UA_PATTERN.test(cache.userAgent)) {
      USER_AGENT = cache.userAgent;
    }
    return cache;
  } catch {
    return null;
  }
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 6000, headers: { 'User-Agent': USER_AGENT_FALLBACK } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error('HTTP ' + res.statusCode)); return; }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject).on('timeout', function () { this.destroy(); reject(new Error('timeout')); });
  });
}

// Chrome Version History API — chính thức, công khai, không cần key.
async function fetchLatestChromeVersion() {
  const data = await fetchJSON('https://versionhistory.googleapis.com/v1/chrome/platforms/win64/channels/stable/versions');
  const version = data?.versions?.[0]?.version;
  if (!version || !VERSION_PATTERN.test(version)) throw new Error('Chrome version response không hợp lệ');
  return version;
}

// Edge Update API — chính thức, công khai, không cần key.
async function fetchLatestEdgeVersion() {
  const products = await fetchJSON('https://edgeupdates.microsoft.com/api/products');
  const stable = Array.isArray(products) ? products.find(p => p.Product === 'Stable') : null;
  const release = stable?.Releases?.find(r => r.Platform === 'Windows' && r.Architecture === 'x64');
  const version = release?.ProductVersion;
  if (!version || !VERSION_PATTERN.test(version)) throw new Error('Edge version response không hợp lệ');
  return version;
}

// Fetch ngầm (fire-and-forget) — mọi lỗi (offline, API đổi định dạng...) đều
// bị nuốt lặng lẽ, giữ nguyên USER_AGENT hiện có (cache cũ hoặc fallback).
async function refreshUserAgent() {
  try {
    const [chromeVersion, edgeVersion] = await Promise.all([
      fetchLatestChromeVersion(),
      fetchLatestEdgeVersion(),
    ]);
    const candidate = buildUserAgent(chromeVersion, edgeVersion);
    if (!UA_PATTERN.test(candidate)) return;
    USER_AGENT = candidate;
    fs.writeFileSync(UA_CACHE_PATH, JSON.stringify({ userAgent: candidate, checkedAt: Date.now() }, null, 2), 'utf8');
  } catch {}
}

function maybeRefreshUserAgent() {
  const cache = loadCachedUserAgent();
  const isStale = !cache || typeof cache.checkedAt !== 'number' || (Date.now() - cache.checkedAt) > UA_REFRESH_INTERVAL_MS;
  if (isStale) refreshUserAgent();
}

// ============================================================
//  CHỐNG CHẠY TRÙNG LẶP (Single Instance Lock)
// ============================================================
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

// ============================================================
//  HỆ THỐNG LƯU CÀI ĐẶT
// ============================================================
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

const DEFAULT_SETTINGS = {
  windowBounds: { width: 1200, height: 800 },
  startMinimized: false,
  autoLaunch: false,
  minimizeToTray: true,
  globalHotkey: 'Ctrl+Shift+M',
  currentTheme: 'default',
  isDarkMode: true,
  alwaysOnTop: false,
  blockSeen: false,
  blockTyping: false,
  appLockEnabled: false,
  appLockHash: '',
  appLockTimeout: 5,
};

function loadSettings() {
  try {
    const data = fs.readFileSync(SETTINGS_PATH, 'utf8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(data) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {}
}

// ============================================================
//  BIẾN TOÀN CỤC
// ============================================================
let mainWindow = null;
let tray = null;
let settings = loadSettings();
let isQuitting = false;
let unreadCount = 0;

let browserViews = {}; // { profileId: BrowserView }
let activeProfileId = null;

// ============================================================
//  TẠO ICON BADGE
// ============================================================
function createBadgeIcon(count) {
  const size = 18;
  const text = count > 9 ? '9+' : String(count);
  const fontSize = count > 9 ? 9 : 11;

  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#e74c3c"/>
      <text x="${size / 2}" y="${size / 2 + fontSize / 3}"
            text-anchor="middle" fill="white"
            font-size="${fontSize}" font-weight="bold"
            font-family="Arial, sans-serif">${text}</text>
    </svg>`;

  return nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  );
}

// ============================================================
//  TẠO SYSTEM TRAY
// ============================================================
function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch {
    trayIcon = nativeImage.createEmpty();
  }
  tray = new Tray(trayIcon);
  updateTrayMenu();
  tray.setToolTip('Messlỏ');

  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  tray.on('double-click', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });
}

function updateTrayMenu() {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    { label: '💬 Mở Messenger', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: '🔄 Tải lại trang', click: () => {
      if (activeProfileId && browserViews[activeProfileId]) {
        browserViews[activeProfileId].webContents.reload();
      }
    }},
    { label: '🚀 Khởi động cùng Windows', type: 'checkbox', checked: settings.autoLaunch, click: (item) => toggleAutoLaunch(item.checked) },
    { label: '📌 Thu nhỏ xuống Tray khi đóng', type: 'checkbox', checked: settings.minimizeToTray, click: (item) => { settings.minimizeToTray = item.checked; saveSettings(settings); } },
    { type: 'separator' },
    { label: '🛡️ Bảo mật', submenu: [
        { label: 'Chặn hiển thị "Đã xem"', type: 'checkbox', checked: settings.blockSeen, click: (item) => toggleBlockSeen(item.checked) },
        { label: 'Chặn hiển thị "Đang nhập"', type: 'checkbox', checked: settings.blockTyping, click: (item) => toggleBlockTyping(item.checked) }
    ]},
    { type: 'separator' },
    { label: '⬇️ Kiểm tra cập nhật', click: () => checkForUpdates(true) },
    { type: 'separator' },
    { label: '❌ Thoát hoàn toàn', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
}

function toggleBlockSeen(enable) {
  settings.blockSeen = enable;
  saveSettings(settings);
}

function toggleBlockTyping(enable) {
  settings.blockTyping = enable;
  saveSettings(settings);
}

// ============================================================
//  AUTO UPDATER
// ============================================================
let isManualUpdateCheck = false;

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Có bản cập nhật mới',
      message: `Đã có bản cập nhật mới v${info.version}. Bạn có muốn tải xuống và cài đặt không?`,
      buttons: ['Tải xuống', 'Bỏ qua']
    }).then(result => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    if (isManualUpdateCheck) {
      dialog.showMessageBox({
        title: 'Không có cập nhật',
        message: 'Bạn đang sử dụng phiên bản mới nhất.'
      });
      isManualUpdateCheck = false;
    }
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      title: 'Đã tải xong cập nhật',
      message: 'Bản cập nhật đã được tải xuống. Ứng dụng sẽ khởi động lại để cài đặt.',
      buttons: ['Cài đặt và Khởi động lại']
    }).then(() => {
      isQuitting = true;
      autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    if (isManualUpdateCheck) {
      let errorMessage = err == null ? "Lỗi không xác định" : (err.stack || err).toString();
      if (errorMessage.includes('No published versions on GitHub') || errorMessage.includes('404 Not Found')) {
        dialog.showMessageBox({
          type: 'info',
          title: 'Thông tin cập nhật',
          message: 'Chưa có bản cập nhật nào được phát hành. Bạn đang sử dụng phiên bản mới nhất!'
        });
      } else {
        dialog.showErrorBox('Lỗi cập nhật', errorMessage);
      }
      isManualUpdateCheck = false;
    }
  });

  // Tự động kiểm tra cập nhật khi khởi động
  setTimeout(() => {
    autoUpdater.checkForUpdates();
  }, 5000);
}

function checkForUpdates(manual = false) {
  isManualUpdateCheck = manual;
  autoUpdater.checkForUpdates();
}

function toggleAutoLaunch(enable) {
  settings.autoLaunch = enable;
  saveSettings(settings);
  app.setLoginItemSettings({ openAtLogin: enable, path: app.getPath('exe') });
}

// ============================================================
//  QUẢN LÝ BROWSERVIEW
// ============================================================
function updateBrowserViewBounds() {
  if (!mainWindow || !activeProfileId || !browserViews[activeProfileId]) return;
  const bounds = mainWindow.getContentBounds();
  // Left sidebar: 52px, Right sidebar: 42px
  const LEFT_SIDEBAR = 52;
  const RIGHT_SIDEBAR = 42;
  browserViews[activeProfileId].setBounds({
    x: LEFT_SIDEBAR,
    y: 0,
    width: Math.max(bounds.width - LEFT_SIDEBAR - RIGHT_SIDEBAR, 0),
    height: Math.max(bounds.height, 0)
  });
}

function setupDownloadHandler(sess) {
  if (sess._downloadHandlerSet) return;
  sess._downloadHandlerSet = true;

  sess.on('will-download', (event, item, webContents) => {
    const id = ++downloadCounter;
    const filename = item.getFilename() || 'download';
    const downloadsPath = app.getPath('downloads');
    const savePath = path.join(downloadsPath, filename);
    item.setSavePath(savePath);

    const total = item.getTotalBytes();
    activeDownloads.set(id, { item, filename, savePath, received: 0, total });

    // Notify renderer about new download
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-started', {
        id, filename, savePath, total,
      });
    }

    item.on('updated', (event, state) => {
      const received = item.getReceivedBytes();
      const dl = activeDownloads.get(id);
      if (dl) dl.received = received;

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-progress', {
          id, received, total: item.getTotalBytes(), state,
        });
      }
    });

    item.once('done', (event, state) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-done', {
          id, state, savePath, filename,
        });
      }
      activeDownloads.delete(id);
    });
  });
}

function setupWebContents(contents, profileId) {
  // Setup download handler for this view's session
  setupDownloadHandler(contents.session);

  // ── Host được phép chạy và mở popup TRONG APP (chia sẻ session với BrowserView cha) ──
  // Chỉ các host thuộc hệ sinh thái Facebook/Messenger.
  // Google/Apple/OAuth bên ngoài không chạy trong app do Google chặn trình duyệt nhúng.
  const IN_APP_HOSTS = [
    'facebook.com',
    'messenger.com',
    'fbcdn.net',
    'meta.com',
    'fbsbx.com',
    'fb.com',
    'workplace.com',
  ];

  const isAllowedHost = (rawUrl, hosts) => {
    let u;
    try { u = new URL(rawUrl); } catch { return false; }
    if (u.protocol === 'about:' || u.protocol === 'javascript:') return true;
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase();
    return hosts.some(h => host === h || host.endsWith('.' + h));
  };

  const isOAuthHost = (rawUrl) => {
    let u;
    try { u = new URL(rawUrl); } catch { return false; }
    const host = u.hostname.toLowerCase();
    return host === 'google.com' || host.endsWith('.google.com') ||
           host === 'apple.com' || host.endsWith('.apple.com');
  };

  let lastOAuthPromptTime = 0;
  const notifyOAuthRedirect = () => {
    const now = Date.now();
    if (now - lastOAuthPromptTime < 10000) return;
    lastOAuthPromptTime = now;
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Đăng nhập bên ngoài',
        message: 'Google/Apple chặn đăng nhập trực tiếp trong ứng dụng.',
        detail: 'Trang đăng nhập đang được mở bằng trình duyệt mặc định của hệ thống.\n\nKhuyến nghị: Để có trải nghiệm ổn định và đồng bộ nhất trên Messlỏ, bạn nên đăng nhập trực tiếp bằng Email/Số điện thoại và Mật khẩu Facebook.',
        buttons: ['Đã hiểu'],
      }).catch(() => {});
    }
  };

  contents.setWindowOpenHandler(({ url }) => {
    // Chỉ popup từ Facebook/Messenger mới được mở trong app
    const isAllowed = isAllowedHost(url, IN_APP_HOSTS);
    if (isAllowed) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 500,
          height: 700,
          title: 'Đăng nhập',
          autoHideMenuBar: true,
          parent: mainWindow,
          modal: false,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
        },
      };
    }
    if (isOAuthHost(url)) notifyOAuthRedirect();
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // ── Chặn BrowserView chính điều hướng sang host bên ngoài (Google OAuth, link chat, v.v.) ──
  contents.on('will-navigate', (event, navUrl) => {
    if (!isAllowedHost(navUrl, IN_APP_HOSTS)) {
      event.preventDefault();
      if (isOAuthHost(navUrl)) notifyOAuthRedirect();
      shell.openExternal(navUrl);
    }
  });

  // ── Chặn HTTP 302/303 redirect chuyển hướng BrowserView sang host bên ngoài ──
  contents.on('will-redirect', (event, redirectUrl) => {
    if (!isAllowedHost(redirectUrl, IN_APP_HOSTS)) {
      event.preventDefault();
      if (isOAuthHost(redirectUrl)) notifyOAuthRedirect();
      shell.openExternal(redirectUrl);
    }
  });

  // ── Xử lý OAuth redirect: tự đóng popup khi quay về Facebook ──
  contents.on('did-create-window', (childWindow) => {
    const childContents = childWindow.webContents;

    // Chặn popup con chuyển hướng ra host bên ngoài
    childContents.on('will-navigate', (event, navUrl) => {
      if (!isAllowedHost(navUrl, IN_APP_HOSTS)) {
        event.preventDefault();
        if (isOAuthHost(navUrl)) notifyOAuthRedirect();
        shell.openExternal(navUrl);
        if (!childWindow.isDestroyed()) childWindow.close();
      }
    });

    childContents.on('will-redirect', (event, redirectUrl) => {
      if (!isAllowedHost(redirectUrl, IN_APP_HOSTS)) {
        event.preventDefault();
        if (isOAuthHost(redirectUrl)) notifyOAuthRedirect();
        shell.openExternal(redirectUrl);
        if (!childWindow.isDestroyed()) childWindow.close();
      }
    });

    // Cho phép OAuth flow hoàn tất tự nhiên trong popup
    // Chỉ đóng popup khi đã redirect hoàn tất về trang Facebook chính
    childContents.on('did-navigate', (event, navUrl) => {
      // Đã đăng nhập thành công → redirect về trang Messenger/Facebook chính.
      // Xác thực HOST thật trước (không chỉ so chuỗi, tránh khớp nhầm host lạ).
      let navHost = '';
      try { navHost = new URL(navUrl).hostname.toLowerCase(); } catch {}
      const backToHome =
        (navHost === 'facebook.com' || navHost.endsWith('.facebook.com') ||
         navHost === 'messenger.com' || navHost.endsWith('.messenger.com')) &&
        (navUrl.includes('/messages') || navUrl.includes('/t/') ||
         /facebook\.com\/?(\?|#|$)/.test(navUrl));
      if (backToHome) {
        // Reload BrowserView cha để nhận session mới, rồi đóng popup
        contents.loadURL(MESSENGER_URL, { userAgent: USER_AGENT });
        setTimeout(() => {
          if (!childWindow.isDestroyed()) childWindow.close();
        }, 500);
      }
    });

    // Tự đóng nếu popup bị close bởi script (window.close())
    childContents.on('will-prevent-unload', (event) => {
      event.preventDefault();
    });
  });

  contents.on('context-menu', (event, params) => {
    const menu = new Menu();
    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions) {
        menu.append(new MenuItem({ label: suggestion, click: () => contents.replaceMisspelling(suggestion) }));
      }
      if (params.dictionarySuggestions.length > 0) menu.append(new MenuItem({ type: 'separator' }));
    }
    if (params.selectionText) menu.append(new MenuItem({ label: '📋 Sao chép', role: 'copy' }));
    if (params.isEditable) {
      menu.append(new MenuItem({ label: '📋 Dán', role: 'paste' }));
      menu.append(new MenuItem({ label: '✂️ Cắt', role: 'cut' }));
      menu.append(new MenuItem({ label: '📝 Chọn tất cả', role: 'selectAll' }));
    }
    if (params.linkURL) {
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ label: '🔗 Mở liên kết', click: () => shell.openExternal(params.linkURL) }));
      menu.append(new MenuItem({ label: '📋 Sao chép liên kết', click: () => require('electron').clipboard.writeText(params.linkURL) }));
    }
    if (params.mediaType === 'image') {
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ label: '💾 Lưu ảnh', click: () => contents.downloadURL(params.srcURL) }));
    }
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({ label: '🔄 Tải lại trang', click: () => contents.reload() }));
    menu.append(new MenuItem({ label: '◀️ Quay lại', enabled: contents.canGoBack(), click: () => contents.goBack() }));
    if (menu.items.length > 0) menu.popup({ window: mainWindow });
  });

  contents.on('did-finish-load', async () => {
    const cssPath = path.join(__dirname, 'custom_style.css');
    try {
      const cssData = fs.readFileSync(cssPath, 'utf8');
      contents.insertCSS(cssData);
    } catch(e) {}
  });

  const avatarInterval = setInterval(async () => {
    if (contents.isDestroyed()) {
      clearInterval(avatarInterval);
      return;
    }
    const avatarScript = `
      (function() {
        let nav = document.querySelector('div[role="navigation"]');
        if (nav) {
          let images = nav.querySelectorAll('svg image');
          for (let img of images) {
            let href = img.getAttribute('xlink:href') || img.getAttribute('href');
            if (href && (href.includes('scontent') || href.includes('fbcdn'))) return href;
          }
        }
        let images = document.querySelectorAll('svg image');
        for (let img of images) {
          let href = img.getAttribute('xlink:href') || img.getAttribute('href');
          if (href && (href.includes('scontent') || href.includes('fbcdn'))) return href;
        }
        let imgs = document.querySelectorAll('img');
        for (let img of imgs) {
          if (img.src && (img.src.includes('scontent') || img.src.includes('fbcdn')) && img.width > 20 && img.width < 100) return img.src;
        }
        return null;
      })();
    `;
    try {
      const avatarUrl = await contents.executeJavaScript(avatarScript);
      if (avatarUrl && mainWindow && profileId) {
        mainWindow.webContents.send('update-profile-avatar', { id: profileId, avatarUrl });
      } else {
        const cookies = await contents.session.cookies.get({ name: 'c_user' });
        if (cookies && cookies.length > 0) {
          const uid = cookies[0].value;
          const fbAvatar = `https://graph.facebook.com/${uid}/picture?width=150&height=150`;
          if (mainWindow && profileId) {
            mainWindow.webContents.send('update-profile-avatar', { id: profileId, avatarUrl: fbAvatar });
          }
        }
      }
    } catch(e) {}
  }, 5000);

  // ── Unread badge per profile ──
  const unreadInterval = setInterval(async () => {
    if (contents.isDestroyed()) {
      clearInterval(unreadInterval);
      return;
    }
    try {
      const count = await contents.executeJavaScript(`
        (function() {
          var title = document.title || '';
          var match = title.match(/\\((\\d+)\\)/);
          if (match) return parseInt(match[1]);
          var badges = document.querySelectorAll('[data-testid="MWJewelThreadListUnread"], span.pq6dq46d');
          var total = 0;
          badges.forEach(function(b) {
            var n = parseInt(b.textContent);
            if (!isNaN(n)) total += n;
          });
          return total;
        })();
      `);
      if (mainWindow && !mainWindow.isDestroyed() && profileId) {
        mainWindow.webContents.send('update-profile-badge', { id: profileId, count: count || 0 });
      }
    } catch(e) {}
  }, 3000);

  if (app.isPackaged) {
    contents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) event.preventDefault();
    });
    contents.on('devtools-opened', () => contents.closeDevTools());
  } else {
    contents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) contents.toggleDevTools();
    });
  }
}

// ============================================================
//  TẠO CỬA SỔ CHÍNH
// ============================================================
function createWindow() {
  const { windowBounds } = settings;

  mainWindow = new BrowserWindow({
    width: windowBounds.width || 1200,
    height: windowBounds.height || 800,
    x: windowBounds.x,
    y: windowBounds.y,
    minWidth: 400,
    minHeight: 300,
    title: 'Messenger',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: settings.isDarkMode ? '#242526' : '#ffffff',
    show: !settings.startMinimized,
    autoHideMenuBar: true,
    titleBarOverlay: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      spellcheck: false,
    },
  });

  app.on('session-created', (sess) => {
    // Setup download handler on every new session
    setupDownloadHandler(sess);

    // Đặt UA chuẩn cho TOÀN BỘ session — quyết định giá trị `navigator.userAgent`
    // mà JS phía trang web (kể cả popup OAuth) đọc được. Riêng header HTTP thật
    // sự gửi đi được ép lại ở onBeforeSendHeaders bên dưới (xem lý do ở đó).
    sess.setUserAgent(USER_AGENT);

    // Xử lý bước xác thực Passkey/WebAuthn (vd Facebook yêu cầu xác nhận qua
    // tài khoản Google liên kết bằng passkey). Electron KHÔNG có UI mặc định
    // để chọn passkey khi navigator.credentials.get() trả về nhiều credential
    // — nếu app không lắng nghe sự kiện này, request bị Electron tự hủy với
    // lỗi NotAllowedError, khiến trang hiện lại màn "Couldn't sign you in".
    sess.on('select-webauthn-account', async (event, details, callback) => {
      const accounts = details.accounts || [];
      if (accounts.length === 0) { callback(); return; }
      if (accounts.length === 1) { callback(accounts[0].credentialId); return; }

      try {
        const labels = accounts.map(a => a.displayName || a.name || a.userHandle || a.credentialId);
        const result = await dialog.showMessageBox({
          type: 'question',
          title: 'Chọn tài khoản đăng nhập',
          message: 'Chọn tài khoản/passkey để xác thực:',
          buttons: [...labels, 'Hủy'],
          cancelId: labels.length,
        });
        callback(accounts[result.response]?.credentialId);
      } catch {
        callback();
      }
    });

    // Ép cứng header User-Agent + Client Hints (sec-ch-ua*) ở tầng network cho
    // MỌI request trong session này (kể cả popup OAuth) — session.setUserAgent()
    // không kịp áp dụng cho request ĐẦU TIÊN của popup mới tạo (race giữa lúc
    // popup bắt đầu điều hướng và lúc did-create-window chạy), và Chromium tự
    // sinh sec-ch-ua theo ENGINE THẬT (Chromium 122) bất kể UA đã giả lập,
    // khiến 2 tín hiệu mâu thuẫn nhau — chính là dấu hiệu Google dùng để chặn
    // (Error 400: disallowed_useragent) khi đăng nhập Facebook qua Google liên kết.
    sess.webRequest.onBeforeSendHeaders((details, callback) => {
      try {
        const headers = { ...details.requestHeaders };
        for (const key of Object.keys(headers)) {
          if (key.toLowerCase() === 'user-agent') delete headers[key];
        }
        headers['User-Agent'] = USER_AGENT;

        // Chỉ SỬA GIÁ TRỊ các header sec-ch-ua* mà Chromium đã tự quyết định gửi
        // (giữ nguyên logic high-entropy hint gốc của Chromium), để khớp với UA
        // đã giả lập ở trên.
        const hints = buildClientHints(USER_AGENT);
        for (const key of Object.keys(headers)) {
          const lower = key.toLowerCase();
          if (lower.startsWith('sec-ch-ua') && hints[lower] !== undefined) {
            delete headers[key];
            headers[lower] = hints[lower];
          }
        }

        callback({ requestHeaders: headers });
      } catch {
        callback({});
      }
    });

    sess.webRequest.onBeforeRequest({ urls: ['*://*.facebook.com/*', '*://*.messenger.com/*'] }, (details, callback) => {
      let cancel = false;
      
      // Chặn Đã xem (Block Seen)
      if (settings.blockSeen) {
        if (details.url.includes('/change_read_status.php') || details.url.includes('/ajax/mercury/change_read_status.php')) {
          cancel = true;
        }
        if (details.uploadData && details.uploadData.length > 0) {
          const body = details.uploadData[0].bytes ? details.uploadData[0].bytes.toString() : '';
          if (body.includes('LSThreadMarkRead') || body.includes('markThreadRead') || body.includes('ThreadMarkReadMutation') || body.includes('"name":"mark_read"')) {
            cancel = true;
          }
        }
      }

      // Chặn Đang nhập (Block Typing)
      if (settings.blockTyping) {
        if (details.url.includes('/typ.php') || details.url.includes('/ajax/messaging/typ.php')) {
          cancel = true;
        }
        if (details.uploadData && details.uploadData.length > 0) {
          const body = details.uploadData[0].bytes ? details.uploadData[0].bytes.toString() : '';
          if (body.includes('TypingIndicator') || body.includes('LSTypingIndicator') || body.includes('typing_indicator')) {
            cancel = true;
          }
        }
      }

      callback({ cancel });
    });

    sess.setPermissionRequestHandler((webContents, permission, callback) => {
      const url = webContents.getURL();
      const isFacebook = url.includes('facebook.com') || url.includes('messenger.com') || url.includes('fbcdn.net');
      if (isFacebook) {
        const allowedPermissions = [
          'notifications', 'media', 'mediaKeySystem', 'microphone', 
          'camera', 'clipboard-read', 'clipboard-sanitized-write',
        ];
        if (allowedPermissions.includes(permission)) {
          callback(true);
          return;
        }
      }
      callback(false);
    });

    sess.setPermissionCheckHandler((webContents, permission) => {
      const url = webContents?.getURL() || '';
      if (url.includes('facebook.com') || url.includes('messenger.com')) {
        return true;
      }
      return false;
    });
  });

  mainWindow.loadFile('index.html');

  if (app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) event.preventDefault();
    });
    mainWindow.webContents.on('devtools-opened', () => mainWindow.webContents.closeDevTools());
  } else {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) mainWindow.webContents.toggleDevTools();
    });
  }

  mainWindow.on('focus', () => {
    mainWindow.flashFrame(false);
  });

  mainWindow.on('resize', updateBrowserViewBounds);
  mainWindow.on('maximize', updateBrowserViewBounds);
  mainWindow.on('unmaximize', updateBrowserViewBounds);

  mainWindow.on('close', (event) => {
    if (!isQuitting && settings.minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
      return;
    }
    settings.windowBounds = mainWindow.getBounds();
    saveSettings(settings);
  });

  // IPC
  ipcMain.on('switch-profile', (event, profile) => {
    activeProfileId = profile.id;
    if (!browserViews[profile.id]) {
      const view = new BrowserView({
        webPreferences: {
          partition: profile.partition,
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
        }
      });
      browserViews[profile.id] = view;
      setupWebContents(view.webContents, profile.id);
      view.webContents.loadURL(MESSENGER_URL, { userAgent: USER_AGENT });
    }
    mainWindow.setBrowserView(browserViews[profile.id]);
    updateBrowserViewBounds();
  });

  // ── Đăng xuất / Xóa session cho 1 profile ──
  ipcMain.on('logout-profile', async (event, profileData) => {
    const { id, partition } = profileData;
    try {
      // 1. Destroy BrowserView nếu đang tồn tại
      if (browserViews[id]) {
        if (mainWindow && mainWindow.getBrowserView() === browserViews[id]) {
          mainWindow.setBrowserView(null);
        }
        browserViews[id].webContents.destroy();
        delete browserViews[id];
      }

      // 2. Xóa sạch cookies + cache + storage của partition
      const sess = session.fromPartition(partition);
      await sess.clearStorageData({
        storages: ['cookies', 'localstorage', 'sessionstorage', 'cachestorage', 'indexdb', 'shadercache', 'websql', 'serviceworkers'],
      });
      await sess.clearCache();
      await sess.clearAuthCache();

      // 3. Tạo lại BrowserView mới với session sạch
      const view = new BrowserView({
        webPreferences: {
          partition: partition,
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
        }
      });
      browserViews[id] = view;
      setupWebContents(view.webContents, id);
      view.webContents.loadURL(MESSENGER_URL, { userAgent: USER_AGENT });

      // 4. Hiển thị lại
      if (activeProfileId === id) {
        mainWindow.setBrowserView(view);
        updateBrowserViewBounds();
      }

      event.reply('logout-profile-done', { id, success: true });
    } catch (err) {
      event.reply('logout-profile-done', { id, success: false, error: err.message });
    }
  });

  // ── Xóa session sạch khi tạo profile mới (đảm bảo không dùng lại cookie cũ) ──
  ipcMain.on('clear-new-profile-session', async (event, partition) => {
    try {
      const sess = session.fromPartition(partition);
      await sess.clearStorageData({
        storages: ['cookies', 'localstorage', 'sessionstorage', 'cachestorage', 'indexdb', 'shadercache', 'websql', 'serviceworkers'],
      });
      await sess.clearCache();
    } catch (err) {}
  });

  ipcMain.on('set-browserview-visibility', (event, visible) => {
    if (mainWindow) {
      if (visible && activeProfileId && browserViews[activeProfileId]) {
        mainWindow.setBrowserView(browserViews[activeProfileId]);
        updateBrowserViewBounds();
      } else {
        mainWindow.setBrowserView(null);
      }
    }
    // Cho phép gọi bằng sendSync: renderer chặn tới khi view đã được gỡ,
    // nhờ đó màn khóa hiện ra không bị "nháy" nội dung Messenger phía trên.
    event.returnValue = true;
  });

  ipcMain.on('delete-profile', (event, id) => {
    if (browserViews[id]) {
      browserViews[id].webContents.destroy();
      delete browserViews[id];
    }
  });

  ipcMain.on('update-badge', (event, count) => {
    if (count !== unreadCount) {
      const hadNewMessages = count > unreadCount;
      unreadCount = count;
      updateBadge(unreadCount);
      if (hadNewMessages && !mainWindow.isFocused()) {
        mainWindow.flashFrame(true);
      }
    }
  });

  ipcMain.on('set-theme', (event, isDark) => {
    settings.isDarkMode = isDark;
    saveSettings(settings);
    nativeTheme.themeSource = isDark ? 'dark' : 'light';
  });

  ipcMain.on('toggle-always-on-top', () => {
    settings.alwaysOnTop = !settings.alwaysOnTop;
    mainWindow.setAlwaysOnTop(settings.alwaysOnTop);
    saveSettings(settings);
  });

  ipcMain.on('toggle-fullscreen', () => {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
    setTimeout(updateBrowserViewBounds, 100);
  });

  ipcMain.on('zoom-in', () => {
    if (activeProfileId && browserViews[activeProfileId]) {
      const wc = browserViews[activeProfileId].webContents;
      wc.setZoomLevel(wc.getZoomLevel() + 0.5);
    }
  });

  ipcMain.on('zoom-out', () => {
    if (activeProfileId && browserViews[activeProfileId]) {
      const wc = browserViews[activeProfileId].webContents;
      wc.setZoomLevel(wc.getZoomLevel() - 0.5);
    }
  });

  ipcMain.on('reload-page', () => {
    if (activeProfileId && browserViews[activeProfileId]) {
      browserViews[activeProfileId].webContents.reload();
    }
  });

  ipcMain.on('go-home', () => {
    if (activeProfileId && browserViews[activeProfileId]) {
      browserViews[activeProfileId].webContents.loadURL(MESSENGER_URL, { userAgent: USER_AGENT });
    }
  });

  ipcMain.on('go-back', () => {
    if (activeProfileId && browserViews[activeProfileId]) {
      const wc = browserViews[activeProfileId].webContents;
      if (wc.canGoBack()) wc.goBack();
    }
  });

  ipcMain.on('get-settings', (event) => {
    event.returnValue = {
      isDarkMode: settings.isDarkMode,
      alwaysOnTop: settings.alwaysOnTop,
      appLockEnabled: settings.appLockEnabled,
      appLockHash: settings.appLockHash,
      appLockTimeout: settings.appLockTimeout,
    };
  });

  ipcMain.on('save-lock-settings', (event, data) => {
    if (data.enabled !== undefined) settings.appLockEnabled = data.enabled;
    if (data.hash !== undefined) settings.appLockHash = data.hash;
    if (data.timeout !== undefined) settings.appLockTimeout = data.timeout;
    saveSettings(settings);
  });

  ipcMain.on('get-lock-settings', (event) => {
    event.returnValue = {
      enabled: settings.appLockEnabled,
      hash: settings.appLockHash,
      timeout: settings.appLockTimeout,
    };
  });

  // ── Download IPC handlers ──
  ipcMain.on('open-download-file', (event, filePath) => {
    if (filePath && fs.existsSync(filePath)) {
      shell.openPath(filePath);
    }
  });

  ipcMain.on('open-download-folder', (event, filePath) => {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
    } else {
      shell.openPath(app.getPath('downloads'));
    }
  });

  ipcMain.on('cancel-download', (event, id) => {
    const dl = activeDownloads.get(id);
    if (dl && dl.item) {
      dl.item.cancel();
      activeDownloads.delete(id);
    }
  });
}

// ============================================================
//  CẬP NHẬT BADGE TRÊN TASKBAR & TRAY
// ============================================================
function updateBadge(count) {
  if (!mainWindow) return;
  if (process.platform === 'win32') {
    if (count > 0) {
      try {
        mainWindow.setOverlayIcon(createBadgeIcon(count), `${count} tin nhắn chưa đọc`);
      } catch {
        mainWindow.setOverlayIcon(null, '');
      }
    } else {
      mainWindow.setOverlayIcon(null, '');
    }
  }
  if (tray) {
    tray.setToolTip(count > 0 ? `Messenger — ${count} tin nhắn chưa đọc` : 'Messlỏ');
  }
}

// ============================================================
//  ĐĂNG KÝ PHÍM TẮT
// ============================================================
function registerGlobalShortcuts() {
  const hotkey = settings.globalHotkey || 'Ctrl+Shift+M';
  try {
    globalShortcut.register(hotkey, () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (err) {}
}

// ============================================================
//  KHỞI ĐỘNG ỨNG DỤNG
// ============================================================
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  nativeTheme.themeSource = settings.isDarkMode ? 'dark' : 'light';
  maybeRefreshUserAgent();
  createWindow();
  createTray();
  registerGlobalShortcuts();
  setupAutoUpdater();

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// ============================================================
//  XỬ LÝ THOÁT
// ============================================================
app.on('before-quit', () => {
  isQuitting = true;
  if (mainWindow) {
    settings.windowBounds = mainWindow.getBounds();
    saveSettings(settings);
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

