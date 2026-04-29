// ============================================================
//  MESSENGER PREMIUM — Ứng dụng Messenger Desktop cho Windows
//  Nhân: Chromium (Google Chrome)
//  Tác giả: TruongIT
// ============================================================

const {
  app,
  BrowserWindow,
  shell,
  session,
  Menu,
  MenuItem,
  Tray,
  globalShortcut,
  ipcMain,
  nativeImage,
  nativeTheme,
} = require('electron');
const path = require('path');
const fs = require('fs');

// ============================================================
//  CẤU HÌNH CHUNG
// ============================================================
const MESSENGER_URL = 'https://www.facebook.com/messages';
const APP_ID = 'com.messenger.premium';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// ============================================================
//  CHỐNG CHẠY TRÙNG LẶP (Single Instance Lock)
//  Nếu người dùng mở app lần 2, sẽ focus vào cửa sổ đang mở
// ============================================================
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// ============================================================
//  ĐĂNG KÝ DANH TÍNH VỚI WINDOWS (Để nhận thông báo)
// ============================================================
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

// ============================================================
//  HỆ THỐNG LƯU CÀI ĐẶT (Settings Store)
//  Lưu vị trí cửa sổ, kích thước, và các tùy chọn cá nhân
// ============================================================
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

const DEFAULT_SETTINGS = {
  windowBounds: { width: 1200, height: 800 },
  startMinimized: false,
  autoLaunch: false,
  minimizeToTray: true,
  globalHotkey: 'Ctrl+Shift+M',
  currentTheme: 'default',
  isDarkMode: false,
  alwaysOnTop: false,
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
  } catch (err) {
    console.error('Không thể lưu cài đặt:', err);
  }
}

// ============================================================
//  BIẾN TOÀN CỤC
// ============================================================
let mainWindow = null;
let tray = null;
let settings = loadSettings();
let isQuitting = false;
let unreadCount = 0;

// ============================================================
//  TẠO ICON BADGE (Số tin nhắn chưa đọc trên Taskbar)
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
//  TẠO SYSTEM TRAY (Biểu tượng trên khay hệ thống)
// ============================================================
function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');

  // Nếu không tìm thấy icon, tạo một icon mặc định
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);

  updateTrayMenu();

  tray.setToolTip('Messenger Premium');

  // Click vào tray icon → hiện/ẩn cửa sổ
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Double-click → luôn hiện cửa sổ
  tray.on('double-click', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });
}

function updateTrayMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '💬 Mở Messenger',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: 'separator' },
    {
      label: '🔄 Tải lại trang',
      click: () => mainWindow.webContents.reload(),
    },
    {
      label: '🚀 Khởi động cùng Windows',
      type: 'checkbox',
      checked: settings.autoLaunch,
      click: (item) => toggleAutoLaunch(item.checked),
    },
    {
      label: '📌 Thu nhỏ xuống Tray khi đóng',
      type: 'checkbox',
      checked: settings.minimizeToTray,
      click: (item) => {
        settings.minimizeToTray = item.checked;
        saveSettings(settings);
      },
    },
    { type: 'separator' },
    {
      label: '❌ Thoát hoàn toàn',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

// ============================================================
//  KHỞI ĐỘNG CÙNG WINDOWS (Auto Launch)
// ============================================================
function toggleAutoLaunch(enable) {
  settings.autoLaunch = enable;
  saveSettings(settings);
  app.setLoginItemSettings({
    openAtLogin: enable,
    path: app.getPath('exe'),
  });
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
    // Đổi màu thanh tiêu đề Windows (chỉ hoạt động trên Win 10/11)
    titleBarOverlay: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: true,
      backgroundThrottling: false,
    },
  });

  // --------------------------------------------------------
  //  CẤP QUYỀN TỰ ĐỘNG (Notifications, Camera, Mic...)
  //  Giúp Messenger hoạt động đầy đủ mà không cần hỏi
  // --------------------------------------------------------
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const url = webContents.getURL();
      const isFacebook =
        url.includes('facebook.com') || url.includes('messenger.com') || url.includes('fbcdn.net');

      if (isFacebook) {
        // Cho phép tất cả quyền từ Facebook
        const allowedPermissions = [
          'notifications',
          'media',
          'mediaKeySystem',
          'microphone',
          'camera',
          'clipboard-read',
          'clipboard-sanitized-write',
        ];
        if (allowedPermissions.includes(permission)) {
          callback(true);
          return;
        }
      }
      callback(false);
    }
  );

  // Xử lý kiểm tra quyền (permission check)
  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission) => {
      const url = webContents?.getURL() || '';
      if (url.includes('facebook.com') || url.includes('messenger.com')) {
        return true;
      }
      return false;
    }
  );

  // --------------------------------------------------------
  //  TẢI TRANG MESSENGER
  // --------------------------------------------------------
  mainWindow.loadURL(MESSENGER_URL, { userAgent: USER_AGENT });

  // --------------------------------------------------------
  //  NHÚNG CSS + SIDEBAR TÙY BIẾN
  // --------------------------------------------------------
  mainWindow.webContents.on('did-finish-load', () => {
    injectCustomCSS();
    injectThemeCSS();
    setTimeout(() => { injectSidebar(); }, 2000);
  });

  // Bật DevTools bằng F12 hoặc Ctrl+Shift+I
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.webContents.on('did-navigate', () => {
    setTimeout(() => {
      injectCustomCSS();
      injectThemeCSS();
      setTimeout(() => { injectSidebar(); }, 1000);
    }, 1500);
  });

  // --------------------------------------------------------
  //  PHÁT HIỆN SỐ TIN NHẮN CHƯA ĐỌC TỪ TIÊU ĐỀ TRANG
  //  Facebook thay đổi tiêu đề thành: "(3) Chats | Messenger"
  // --------------------------------------------------------
  mainWindow.webContents.on('page-title-updated', (event, title) => {
    event.preventDefault(); // Giữ tiêu đề cửa sổ là "Messenger Premium"

    const match = title.match(/^\((\d+)\)/);
    const newCount = match ? parseInt(match[1], 10) : 0;

    if (newCount !== unreadCount) {
      const hadNewMessages = newCount > unreadCount;
      unreadCount = newCount;
      updateBadge(unreadCount);

      // Nháy thanh Taskbar khi có tin nhắn mới
      if (hadNewMessages && !mainWindow.isFocused()) {
        mainWindow.flashFrame(true);
      }
    }
  });

  // Tắt nháy khi focus vào cửa sổ
  mainWindow.on('focus', () => {
    mainWindow.flashFrame(false);
  });

  // --------------------------------------------------------
  //  MENU CHUỘT PHẢI TÙY BIẾN (Context Menu - Tiếng Việt)
  // --------------------------------------------------------
  mainWindow.webContents.on('context-menu', (event, params) => {
    const menu = new Menu();

    if (params.misspelledWord) {
      // Gợi ý sửa chính tả
      for (const suggestion of params.dictionarySuggestions) {
        menu.append(
          new MenuItem({
            label: suggestion,
            click: () =>
              mainWindow.webContents.replaceMisspelling(suggestion),
          })
        );
      }
      if (params.dictionarySuggestions.length > 0) {
        menu.append(new MenuItem({ type: 'separator' }));
      }
    }

    if (params.selectionText) {
      menu.append(new MenuItem({ label: '📋 Sao chép', role: 'copy' }));
    }
    if (params.isEditable) {
      menu.append(new MenuItem({ label: '📋 Dán', role: 'paste' }));
      menu.append(new MenuItem({ label: '✂️ Cắt', role: 'cut' }));
      menu.append(new MenuItem({ label: '📝 Chọn tất cả', role: 'selectAll' }));
    }

    if (params.linkURL) {
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(
        new MenuItem({
          label: '🔗 Mở liên kết trong trình duyệt',
          click: () => shell.openExternal(params.linkURL),
        })
      );
      menu.append(
        new MenuItem({
          label: '📋 Sao chép liên kết',
          click: () => {
            const { clipboard } = require('electron');
            clipboard.writeText(params.linkURL);
          },
        })
      );
    }

    if (params.mediaType === 'image') {
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(
        new MenuItem({
          label: '💾 Lưu ảnh',
          click: () => {
            mainWindow.webContents.downloadURL(params.srcURL);
          },
        })
      );
    }

    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(
      new MenuItem({
        label: '🔄 Tải lại trang',
        click: () => mainWindow.webContents.reload(),
      })
    );
    menu.append(
      new MenuItem({
        label: '◀️ Quay lại',
        enabled: mainWindow.webContents.canGoBack(),
        click: () => mainWindow.webContents.goBack(),
      })
    );

    if (menu.items.length > 0) {
      menu.popup({ window: mainWindow });
    }
  });

  // --------------------------------------------------------
  //  MỞ LIÊN KẾT BÊN NGOÀI BẰNG TRÌNH DUYỆT MẶC ĐỊNH
  // --------------------------------------------------------
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('facebook.com') || url.includes('messenger.com') || url.includes('fbcdn.net')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // --------------------------------------------------------
  //  XỬ LÝ ĐÓNG CỬA SỔ
  //  Nếu bật "Thu nhỏ xuống Tray", ẩn thay vì thoát
  // --------------------------------------------------------
  mainWindow.on('close', (event) => {
    if (!isQuitting && settings.minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
      return;
    }
    // Lưu vị trí & kích thước cửa sổ trước khi thoát
    settings.windowBounds = mainWindow.getBounds();
    saveSettings(settings);
  });

  // --------------------------------------------------------
  //  IPC: NHẬN TÍN HIỆU TỪ PRELOAD
  // --------------------------------------------------------
  ipcMain.on('notification-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Toggle sáng/tối
  ipcMain.on('toggle-dark-mode', () => {
    settings.isDarkMode = !settings.isDarkMode;
    saveSettings(settings);
    nativeTheme.themeSource = settings.isDarkMode ? 'dark' : 'light';
    setTimeout(() => { mainWindow.webContents.reload(); }, 300);
  });

  // Toggle always on top
  ipcMain.on('toggle-always-on-top', () => {
    settings.alwaysOnTop = !settings.alwaysOnTop;
    mainWindow.setAlwaysOnTop(settings.alwaysOnTop);
    saveSettings(settings);
  });

  // Tải lại trang
  ipcMain.on('reload-page', () => {
    mainWindow.webContents.reload();
  });

  // Zoom in
  ipcMain.on('zoom-in', () => {
    const zoom = mainWindow.webContents.getZoomFactor();
    mainWindow.webContents.setZoomFactor(Math.min(zoom + 0.1, 1.5));
  });

  // Zoom out
  ipcMain.on('zoom-out', () => {
    const zoom = mainWindow.webContents.getZoomFactor();
    mainWindow.webContents.setZoomFactor(Math.max(zoom - 0.1, 0.7));
  });

  // Toggle fullscreen
  ipcMain.on('toggle-fullscreen', () => {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  });

  // Lấy cài đặt
  ipcMain.on('get-settings', (event) => {
    event.returnValue = {
      isDarkMode: settings.isDarkMode,
      alwaysOnTop: settings.alwaysOnTop,
    };
  });
}

// ============================================================
//  NHÚNG CSS TÙY BIẾN
// ============================================================
function injectCustomCSS() {
  const cssPath = path.join(__dirname, 'custom_style.css');
  try {
    const cssData = fs.readFileSync(cssPath, 'utf8');
    mainWindow.webContents.insertCSS(cssData).then(() => {
      console.log('✅ CSS đã được nhúng thành công');
    }).catch(err => {
      console.error('❌ Lỗi nhúng CSS:', err);
    });
  } catch (err) {
    console.error('❌ Không thể đọc custom_style.css:', err);
  }
}

// ============================================================
//  NHÚNG CSS THEME (scrollbar, focus ring)
// ============================================================
let currentThemeCSSKey = null;

function injectThemeCSS() {
  if (currentThemeCSSKey) {
    mainWindow.webContents.removeInsertedCSS(currentThemeCSSKey).catch(() => {});
    currentThemeCSSKey = null;
  }
  const css = `
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 10px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.25); }
    div[role="textbox"]:focus { outline: none !important; }
  `;
  mainWindow.webContents.insertCSS(css).then(key => {
    currentThemeCSSKey = key;
  }).catch(() => {});
}

// ============================================================
//  SIDEBAR TÙY CHỈNH — SVG Icons chuyên nghiệp
// ============================================================
function injectSidebar() {
  const isDark = settings.isDarkMode;
  const bg = isDark ? '#1e1e1e' : '#f5f7fb';
  const iconFill = isDark ? '#b0b3b8' : '#65676b';
  const iconHover = isDark ? '#e4e6eb' : '#050505';
  const hoverBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const pinOp = settings.alwaysOnTop ? '1' : '0.4';

  // SVG icons - clean monochrome
  const ICONS = {
    logo: '<svg viewBox="0 0 800 800" width="28" height="28"><radialGradient id="mg" cx="101.9" cy="809" r="1.1" gradientTransform="matrix(800 0 0 -800 -81386 648000)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#09f"/><stop offset=".6" stop-color="#a033ff"/><stop offset=".9" stop-color="#ff5280"/><stop offset="1" stop-color="#ff7061"/></radialGradient><path fill="url(#mg)" d="M400 0C174.7 0 0 165.1 0 388c0 116.6 47.8 217.4 125.6 287 6.5 5.8 10.5 14 10.7 22.8l2.2 71.2a32 32 0 0 0 44.9 28.3l79.4-35c6.7-3 14.3-3.5 21.4-1.6 36.5 10 75.3 15.4 115.8 15.4 225.3 0 400-165.1 400-388S625.3 0 400 0z"/><path fill="#FFF" d="m159.8 501.5 117.5-186.4a60 60 0 0 1 86.8-16l93.5 70.1a24 24 0 0 0 28.9-.1l126.2-95.8c16.8-12.8 38.8 7.4 27.6 25.3L522.7 484.9a60 60 0 0 1-86.8 16l-93.5-70.1a24 24 0 0 0-28.9.1l-126.2 95.8c-16.8 12.8-38.8-7.3-27.5-25.2z"/></svg>',
    sun: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="IC" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    moon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="IC" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    pin: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="IC" stroke-width="2" stroke-linecap="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6a1 1 0 0 1 1-1h.5a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5h-9a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5H8a1 1 0 0 1 1 1z"/></svg>',
    fullscreen: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="IC" stroke-width="2" stroke-linecap="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
    zoomIn: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="IC" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
    zoomOut: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="IC" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
    reload: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="IC" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
  };

  // Replace IC placeholder with actual icon color
  const ic = (svg) => svg.replace(/IC/g, iconFill);
  const darkModeIcon = isDark ? ic(ICONS.sun) : ic(ICONS.moon);

  const jsCode = `(function(){
    if(document.getElementById('mp-sidebar')) return;

    var s = document.createElement('div');
    s.id = 'mp-sidebar';
    s.style.cssText = 'position:fixed;top:0;left:0;bottom:0;width:52px;background:${bg};display:flex;flex-direction:column;align-items:center;padding:14px 0 10px;gap:4px;z-index:99999;border-right:1px solid ${border};';

    var btnCSS = 'width:38px;height:38px;border:none;border-radius:12px;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s ease;padding:0;';

    s.innerHTML = '<button class="mp-btn" id="mp-dark-btn" title="' + (${isDark} ? 'Chế độ sáng' : 'Chế độ tối') + '" style="' + btnCSS + '">${darkModeIcon}</button>'
      + '<div style="flex:1;"></div>'
      + '<button class="mp-btn" id="mp-zin-btn" title="Phóng to" style="' + btnCSS + '">${ic(ICONS.zoomIn)}</button>'
      + '<button class="mp-btn" id="mp-zout-btn" title="Thu nhỏ" style="' + btnCSS + '">${ic(ICONS.zoomOut)}</button>'
      + '<button class="mp-btn" id="mp-fs-btn" title="Toàn màn hình" style="' + btnCSS + '">${ic(ICONS.fullscreen)}</button>'
      + '<button class="mp-btn" id="mp-pin-btn" title="Ghim cửa sổ" style="' + btnCSS + 'opacity:${pinOp};">${ic(ICONS.pin)}</button>'
      + '<button class="mp-btn" id="mp-reload-btn" title="Tải lại" style="' + btnCSS + '">${ic(ICONS.reload)}</button>';

    document.body.appendChild(s);
    document.body.style.marginLeft = '52px';

    // Hover: đổi màu icon
    s.querySelectorAll('.mp-btn').forEach(function(b){
      b.onmouseover = function(){
        this.style.background = '${hoverBg}';
        this.querySelectorAll('svg').forEach(function(sv){ sv.setAttribute('stroke','${iconHover}'); });
      };
      b.onmouseout = function(){
        this.style.background = 'transparent';
        this.querySelectorAll('svg').forEach(function(sv){ sv.setAttribute('stroke','${iconFill}'); });
      };
    });

    document.getElementById('mp-dark-btn').onclick = function(){ window.messengerApp.toggleDarkMode(); };
    document.getElementById('mp-pin-btn').onclick = function(){
      window.messengerApp.toggleAlwaysOnTop();
      this.style.opacity = this.style.opacity === '1' ? '0.4' : '1';
    };
    document.getElementById('mp-fs-btn').onclick = function(){ window.messengerApp.toggleFullscreen(); };
    document.getElementById('mp-zin-btn').onclick = function(){ window.messengerApp.zoomIn(); };
    document.getElementById('mp-zout-btn').onclick = function(){ window.messengerApp.zoomOut(); };
    document.getElementById('mp-reload-btn').onclick = function(){ window.messengerApp.reloadPage(); };

    // XỬ LÝ KHOẢNG TRỐNG NAV — override CSS variable
    var navFixCount = 0;
    var navFixer = setInterval(function(){
      navFixCount++;
      if(navFixCount > 30){ clearInterval(navFixer); return; }
      // CHÌA KHÓA: Override biến CSS --header-height về 0
      document.documentElement.style.setProperty('--header-height','0px','important');
      // Ẩn progressbar loading
      document.querySelectorAll('div[role="progressbar"]').forEach(function(pb){
        pb.style.cssText = 'display:none!important;height:0!important;position:absolute!important;top:-9999px!important;';
      });
      // Ẩn banner
      var banner = document.querySelector('div[role="banner"]');
      if(banner){
        banner.style.cssText = 'display:none!important;height:0!important;min-height:0!important;max-height:0!important;overflow:hidden!important;flex:0!important;';
      }
    }, 500);
  })();`;

  mainWindow.webContents.executeJavaScript(jsCode).catch(err => {
    console.error('Lỗi inject sidebar:', err);
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
        const badgeIcon = createBadgeIcon(count);
        mainWindow.setOverlayIcon(badgeIcon, `${count} tin nhắn chưa đọc`);
      } catch {
        // Fallback nếu không tạo được badge icon
        mainWindow.setOverlayIcon(null, '');
      }
    } else {
      mainWindow.setOverlayIcon(null, '');
    }
  }

  // Cập nhật tooltip cho System Tray
  if (tray) {
    tray.setToolTip(
      count > 0
        ? `Messenger — ${count} tin nhắn chưa đọc`
        : 'Messenger Premium'
    );
  }
}

// ============================================================
//  ĐĂNG KÝ PHÍM TẮT TOÀN CỤC (Global Shortcut)
//  Mặc định: Ctrl+Shift+M → Hiện/ẩn cửa sổ Messenger
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
  } catch (err) {
    console.error(`Không thể đăng ký phím tắt ${hotkey}:`, err);
  }
}

// ============================================================
//  KHỞI ĐỘNG ỨNG DỤNG
// ============================================================
app.whenReady().then(() => {
  // Xóa hoàn toàn menu bar (File, Edit, View, Window, Help)
  Menu.setApplicationMenu(null);

  // Đặt theme hệ thống trước khi tạo cửa sổ
  nativeTheme.themeSource = settings.isDarkMode ? 'dark' : 'light';

  createWindow();
  createTray();
  registerGlobalShortcuts();

  // Nếu người dùng mở lại app khi đã có instance
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // macOS: tạo cửa sổ mới nếu chưa có
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// ============================================================
//  XỬ LÝ THOÁT ỨNG DỤNG
// ============================================================
app.on('before-quit', () => {
  isQuitting = true;
  // Lưu cài đặt trước khi thoát
  if (mainWindow) {
    settings.windowBounds = mainWindow.getBounds();
    saveSettings(settings);
  }
});

app.on('will-quit', () => {
  // Hủy đăng ký tất cả phím tắt
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
