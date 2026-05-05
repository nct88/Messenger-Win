const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

const profilesList = document.getElementById('profiles-list');
const scrollUpBtn = document.getElementById('scroll-up');
const scrollDownBtn = document.getElementById('scroll-down');

// Load profiles
let profiles = [];
try {
  const saved = localStorage.getItem('mp_profiles');
  if (saved) profiles = JSON.parse(saved);
} catch(e) {}

if (profiles.length === 0) {
  profiles = [{ id: Date.now().toString(), name: 'Nick 1', partition: 'persist:nick_1' }];
  saveProfiles();
}

let activeProfileId = profiles[0].id;

function saveProfiles() {
  localStorage.setItem('mp_profiles', JSON.stringify(profiles));
}

// ============================================================
//  SCROLL ARROWS & DRAG SCROLL
// ============================================================
function updateScrollArrows() {
  if (!profilesList) return;
  const canScrollUp = profilesList.scrollTop > 0;
  const canScrollDown = profilesList.scrollTop + profilesList.clientHeight < profilesList.scrollHeight - 1;
  
  scrollUpBtn.classList.toggle('visible', canScrollUp);
  scrollDownBtn.classList.toggle('visible', canScrollDown);
}

// Scroll arrow buttons
let scrollInterval = null;
function startScrolling(direction) {
  stopScrolling();
  const step = direction === 'up' ? -4 : 4;
  scrollInterval = setInterval(() => {
    profilesList.scrollTop += step;
    updateScrollArrows();
  }, 16);
}
function stopScrolling() {
  if (scrollInterval) { clearInterval(scrollInterval); scrollInterval = null; }
}

scrollUpBtn.addEventListener('mousedown', () => startScrolling('up'));
scrollUpBtn.addEventListener('mouseup', stopScrolling);
scrollUpBtn.addEventListener('mouseleave', stopScrolling);
scrollDownBtn.addEventListener('mousedown', () => startScrolling('down'));
scrollDownBtn.addEventListener('mouseup', stopScrolling);
scrollDownBtn.addEventListener('mouseleave', stopScrolling);

// Click to scroll by one item
scrollUpBtn.addEventListener('click', () => {
  profilesList.scrollBy({ top: -50, behavior: 'smooth' });
  setTimeout(updateScrollArrows, 300);
});
scrollDownBtn.addEventListener('click', () => {
  profilesList.scrollBy({ top: 50, behavior: 'smooth' });
  setTimeout(updateScrollArrows, 300);
});

// Mouse drag scrolling on profiles list
let isDragging = false;
let dragStartY = 0;
let dragScrollTop = 0;

profilesList.addEventListener('mousedown', (e) => {
  // Only start drag if clicking on the list itself or between items
  isDragging = true;
  dragStartY = e.clientY;
  dragScrollTop = profilesList.scrollTop;
  profilesList.classList.add('dragging');
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  e.preventDefault();
  const diff = dragStartY - e.clientY;
  profilesList.scrollTop = dragScrollTop + diff;
  updateScrollArrows();
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    profilesList.classList.remove('dragging');
  }
});

// Mouse wheel scroll
profilesList.addEventListener('wheel', (e) => {
  e.preventDefault();
  profilesList.scrollTop += e.deltaY > 0 ? 50 : -50;
  updateScrollArrows();
}, { passive: false });

// Update arrows on content changes
const resizeObserver = new ResizeObserver(updateScrollArrows);
resizeObserver.observe(profilesList);

// ============================================================
//  RENDER SIDEBAR
// ============================================================
function renderSidebar() {
  profilesList.innerHTML = '';
  profiles.forEach(p => {
    const btn = document.createElement('div');
    btn.className = `profile-btn ${p.id === activeProfileId ? 'active' : ''}`;
    btn.title = p.name + ' (Click phải để đổi tên/xóa)';
    
    const span = document.createElement('span');
    span.innerText = p.name.charAt(0).toUpperCase();
    
    // Add avatar image if exists
    if (p.avatar) {
      const img = document.createElement('img');
      img.src = p.avatar.startsWith('http') ? p.avatar : `file://${p.avatar.replace(/\\/g, '/')}`;
      img.style.width = '100%'; img.style.height = '100%'; img.style.borderRadius = '50%';
      img.style.objectFit = 'cover'; img.style.position = 'absolute'; img.style.top = '0'; img.style.left = '0';
      btn.appendChild(img);
      span.style.display = 'none';
    } else {
      btn.appendChild(span);
    }
    
    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.id = `badge-${p.id}`;
    badge.innerText = '0';
    btn.appendChild(badge);
    
    btn.onclick = () => switchProfile(p.id);
    
    btn.oncontextmenu = () => {
      openModal(p);
    };
    
    profilesList.appendChild(btn);
  });
  
  // Update scroll arrows after rendering
  setTimeout(updateScrollArrows, 50);
}

function switchProfile(id) {
  activeProfileId = id;
  renderSidebar();
  const p = profiles.find(x => x.id === id);
  if (p) {
    ipcRenderer.send('switch-profile', p);
  }
}

// ============================================================
//  MODAL LOGIC
// ============================================================
let editingProfile = null;
let tempAvatarPath = null;
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const nameInput = document.getElementById('profile-name-input');
const avatarPreview = document.getElementById('avatar-preview');
const avatarImg = document.getElementById('avatar-img');
const avatarLetter = document.getElementById('avatar-letter');
const avatarInput = document.getElementById('avatar-input');

function openModal(profileToEdit = null) {
  ipcRenderer.send('set-browserview-visibility', false);
  editingProfile = profileToEdit;
  tempAvatarPath = profileToEdit ? profileToEdit.avatar : null;
  
  modalTitle.innerText = profileToEdit ? 'Chỉnh sửa tài khoản' : 'Thêm tài khoản';
  nameInput.value = profileToEdit ? profileToEdit.name : '';
  document.getElementById('modal-delete').style.display = profileToEdit ? 'block' : 'none';
  document.getElementById('modal-logout').style.display = profileToEdit ? 'flex' : 'none';
  
  updateAvatarPreview();
  modalOverlay.style.display = 'flex';
  nameInput.focus();
}

function updateAvatarPreview() {
  if (tempAvatarPath) {
    avatarImg.src = tempAvatarPath.startsWith('http') ? tempAvatarPath : `file://${tempAvatarPath.replace(/\\/g, '/')}`;
    avatarImg.style.display = 'block';
    avatarLetter.style.display = 'none';
  } else {
    avatarImg.style.display = 'none';
    avatarLetter.style.display = 'block';
    avatarLetter.innerText = nameInput.value ? nameInput.value.charAt(0).toUpperCase() : '+';
  }
}

nameInput.addEventListener('input', updateAvatarPreview);

avatarPreview.onclick = () => avatarInput.click();
avatarInput.onchange = (e) => {
  if (e.target.files && e.target.files[0]) {
    tempAvatarPath = e.target.files[0].path;
    updateAvatarPreview();
  }
};

document.getElementById('modal-delete').onclick = () => {
  if (!editingProfile) return;
  const action = confirm(`Bạn có chắc chắn muốn XÓA tài khoản [${editingProfile.name}]?`);
  if (action) {
    if (profiles.length <= 1) {
      alert('Phải có ít nhất 1 tài khoản!');
      return;
    }
    profiles = profiles.filter(x => x.id !== editingProfile.id);
    saveProfiles();
    ipcRenderer.send('delete-profile', editingProfile.id);
    if (activeProfileId === editingProfile.id) switchProfile(profiles[0].id);
    modalOverlay.style.display = 'none';
    renderSidebar();
    ipcRenderer.send('set-browserview-visibility', true);
  }
};

document.getElementById('modal-cancel').onclick = () => {
  modalOverlay.style.display = 'none';
  ipcRenderer.send('set-browserview-visibility', true);
};

document.getElementById('modal-save').onclick = () => {
  const name = nameInput.value.trim();
  if (!name) {
    alert('Vui lòng nhập tên tài khoản!');
    return;
  }
  
  if (editingProfile) {
    editingProfile.name = name;
    editingProfile.avatar = tempAvatarPath;
  } else {
    // Sử dụng crypto UUID để tránh trùng ID
    const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString() + '_' + Math.random().toString(36).slice(2);
    const partition = `persist:nick_${id}`;
    const p = { id, name, avatar: tempAvatarPath, partition };
    // Xóa sạch session cũ nếu tồn tại (đảm bảo không dùng cookie cũ)
    ipcRenderer.send('clear-new-profile-session', partition);
    profiles.push(p);
    activeProfileId = id;
  }
  
  saveProfiles();
  modalOverlay.style.display = 'none';
  renderSidebar();
  ipcRenderer.send('set-browserview-visibility', true);
  if (!editingProfile) switchProfile(activeProfileId);
};

// ── Nút Đăng xuất & Đăng nhập lại ──
document.getElementById('modal-logout').onclick = () => {
  if (!editingProfile) return;
  const profileName = editingProfile.name;
  const action = confirm(`Bạn có chắc muốn ĐĂNG XUẤT tài khoản [${profileName}]?\n\nThao tác này sẽ xóa toàn bộ cookie/session và cho phép bạn đăng nhập lại tài khoản khác.`);
  if (!action) return;

  const logoutBtn = document.getElementById('modal-logout');
  logoutBtn.classList.add('loading');
  logoutBtn.innerHTML = '<svg viewBox="0 0 24 24" style="animation:spin 1s linear infinite"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Đang đăng xuất...';

  // Xóa avatar cache
  editingProfile.avatar = null;
  saveProfiles();

  ipcRenderer.send('logout-profile', { id: editingProfile.id, partition: editingProfile.partition });
};

// Nhận kết quả logout
ipcRenderer.on('logout-profile-done', (event, { id, success }) => {
  const logoutBtn = document.getElementById('modal-logout');
  if (success) {
    logoutBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> ✅ Đã đăng xuất!';
    logoutBtn.style.color = '#51cf66';
    logoutBtn.style.borderColor = '#51cf66';
    setTimeout(() => {
      modalOverlay.style.display = 'none';
      logoutBtn.classList.remove('loading');
      logoutBtn.style.color = '';
      logoutBtn.style.borderColor = '';
      renderSidebar();
      ipcRenderer.send('set-browserview-visibility', true);
    }, 800);
  } else {
    logoutBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> ❌ Lỗi! Thử lại';
    logoutBtn.classList.remove('loading');
  }
});

document.getElementById('btn-add-profile').onclick = () => openModal();

// ============================================================
//  RIGHT SIDEBAR TOOLBAR
// ============================================================
let isDarkMode = true;
const toggleDarkMode = () => {
  isDarkMode = !isDarkMode;
  document.body.className = isDarkMode ? 'dark-mode' : 'light-mode';
  document.getElementById('icon-sun').style.display = isDarkMode ? 'none' : 'block';
  document.getElementById('icon-moon').style.display = isDarkMode ? 'block' : 'none';
  ipcRenderer.send('set-theme', isDarkMode);
};
document.getElementById('btn-dark-mode').onclick = toggleDarkMode;
document.getElementById('btn-zoom-in').onclick = () => ipcRenderer.send('zoom-in');
document.getElementById('btn-zoom-out').onclick = () => ipcRenderer.send('zoom-out');
document.getElementById('btn-fs').onclick = () => ipcRenderer.send('toggle-fullscreen');
document.getElementById('btn-pin').onclick = () => {
  const btn = document.getElementById('btn-pin');
  const isPinned = btn.style.opacity === '1';
  btn.style.opacity = isPinned ? '0.4' : '1';
  ipcRenderer.send('toggle-always-on-top');
};
document.getElementById('btn-reload').onclick = () => ipcRenderer.send('reload-page');
document.getElementById('btn-home').onclick = () => ipcRenderer.send('go-home');
document.getElementById('btn-back').onclick = () => ipcRenderer.send('go-back');
document.getElementById('btn-j2team').onclick = () => {
  require('electron').shell.openExternal('https://chromewebstore.google.com/detail/j2team-security/hmlcjjclebjnfohgmgikjfnbmfkigocc');
};

// Lock button — click: lock, right-click: settings
document.getElementById('btn-lock').onclick = () => {
  const ls = ipcRenderer.sendSync('get-lock-settings');
  if (ls.enabled && ls.hash) {
    lockApp('verify');
  } else {
    lockApp('setup');
  }
};
document.getElementById('btn-lock').oncontextmenu = (e) => {
  e.preventDefault();
  openLockSettings();
};

// ============================================================
//  IPC UPDATES FROM MAIN
// ============================================================
let profileBadgeCounts = {};

ipcRenderer.on('update-profile-badge', (event, { id, count }) => {
  const badge = document.getElementById(`badge-${id}`);
  if (badge) {
    badge.innerText = count > 9 ? '9+' : count;
    badge.style.display = count > 0 ? 'block' : 'none';
  }
  profileBadgeCounts[id] = count || 0;
  const totalCount = Object.values(profileBadgeCounts).reduce((a, b) => a + b, 0);
  ipcRenderer.send('update-badge', totalCount);
});

ipcRenderer.on('update-profile-avatar', (event, { id, avatarUrl }) => {
  const p = profiles.find(x => x.id === id);
  if (p) {
    const isAutoAvatar = !p.avatar || p.avatar.includes('graph.facebook.com') || p.avatar.includes('scontent') || p.avatar.includes('fbcdn');
    if (isAutoAvatar && p.avatar !== avatarUrl) {
      p.avatar = avatarUrl;
      saveProfiles();
      renderSidebar();
    }
  }
});

// ============================================================
//  INIT
// ============================================================
const settings = ipcRenderer.sendSync('get-settings');
isDarkMode = settings.isDarkMode;
document.body.className = isDarkMode ? 'dark-mode' : 'light-mode';
document.getElementById('icon-sun').style.display = isDarkMode ? 'none' : 'block';
document.getElementById('icon-moon').style.display = isDarkMode ? 'block' : 'none';
if(settings.alwaysOnTop) {
  document.getElementById('btn-pin').style.opacity = '1';
}

renderSidebar();
switchProfile(activeProfileId);

// ============================================================
//  APP LOCK MODULE
// ============================================================
const crypto = require('crypto');

const lockScreen = document.getElementById('lock-screen');
const pinDotsContainer = document.getElementById('pin-dots');
const lockMessage = document.getElementById('lock-message');
const pinKeys = document.querySelectorAll('.pin-key[data-key]');
const lockDisableBtn = document.getElementById('lock-disable-btn');

const lock = {
  mode: 'verify',    // 'verify' | 'setup' | 'confirm'
  enteredPin: '',
  setupPin: '',
  wrongAttempts: 0,
  idleTimer: null,
  isLocked: false,
};

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin + '_messlo_salt_2026').digest('hex');
}

function lockApp(mode) {
  lock.mode = mode || 'verify';
  lock.enteredPin = '';
  lock.setupPin = '';
  lock.isLocked = true;
  lockScreen.classList.add('active');
  ipcRenderer.send('set-browserview-visibility', false);
  updatePinDots();

  if (mode === 'setup') {
    lockMessage.textContent = 'Tạo mã PIN mới (4 số)';
    lockMessage.className = 'lock-subtitle';
    lockDisableBtn.style.display = 'none';
  } else {
    lockMessage.textContent = 'Nhập mã PIN để mở khoá';
    lockMessage.className = 'lock-subtitle';
    lockDisableBtn.style.display = 'none';
  }
}

function unlockApp() {
  lock.isLocked = false;
  lock.enteredPin = '';
  lock.wrongAttempts = 0;
  lockScreen.classList.remove('active');
  ipcRenderer.send('set-browserview-visibility', true);
  resetIdleTimer();
}

function updatePinDots() {
  const dots = pinDotsContainer.querySelectorAll('.pin-dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('filled', i < lock.enteredPin.length);
  });
}

function handlePinKey(key) {
  if (key === 'delete') {
    lock.enteredPin = lock.enteredPin.slice(0, -1);
    updatePinDots();
    return;
  }
  if (lock.enteredPin.length >= 4) return;
  lock.enteredPin += key;
  updatePinDots();
  if (lock.enteredPin.length === 4) {
    setTimeout(handlePinComplete, 200);
  }
}

function handlePinComplete() {
  const ls = ipcRenderer.sendSync('get-lock-settings');

  if (lock.mode === 'setup') {
    // Step 1: Save first entry
    lock.setupPin = lock.enteredPin;
    lock.enteredPin = '';
    lock.mode = 'confirm';
    lockMessage.textContent = 'Xác nhận lại mã PIN';
    lockMessage.className = 'lock-subtitle';
    updatePinDots();

  } else if (lock.mode === 'confirm') {
    // Step 2: Confirm PIN match
    if (lock.enteredPin === lock.setupPin) {
      const hash = hashPin(lock.enteredPin);
      ipcRenderer.send('save-lock-settings', { enabled: true, hash });
      lockMessage.textContent = '✅ Đã thiết lập mã PIN!';
      lockMessage.className = 'lock-subtitle success';
      setTimeout(unlockApp, 700);
    } else {
      lockMessage.textContent = 'Không khớp! Nhập lại từ đầu';
      lockMessage.className = 'lock-subtitle error';
      pinDotsContainer.classList.add('shake');
      setTimeout(() => {
        pinDotsContainer.classList.remove('shake');
        lock.mode = 'setup';
        lock.enteredPin = '';
        lock.setupPin = '';
        lockMessage.textContent = 'Tạo mã PIN mới (4 số)';
        lockMessage.className = 'lock-subtitle';
        updatePinDots();
      }, 600);
    }

  } else if (lock.mode === 'verify') {
    // Verify PIN
    const hash = hashPin(lock.enteredPin);
    if (hash === ls.hash) {
      lockMessage.textContent = '✅ Đã mở khoá!';
      lockMessage.className = 'lock-subtitle success';
      setTimeout(unlockApp, 300);
    } else {
      lock.wrongAttempts++;
      lockMessage.textContent = `Sai mã PIN! (${lock.wrongAttempts}/5)`;
      lockMessage.className = 'lock-subtitle error';
      pinDotsContainer.classList.add('shake');
      lock.enteredPin = '';
      setTimeout(() => {
        pinDotsContainer.classList.remove('shake');
        updatePinDots();
      }, 500);

      if (lock.wrongAttempts >= 5) {
        lockMessage.textContent = 'Quá 5 lần sai. Đợi 30 giây...';
        pinKeys.forEach(k => k.disabled = true);
        setTimeout(() => {
          lock.wrongAttempts = 0;
          lockMessage.textContent = 'Nhập mã PIN để mở khoá';
          lockMessage.className = 'lock-subtitle';
          pinKeys.forEach(k => k.disabled = false);
        }, 30000);
      }
    }
  }
}

// PIN pad click handlers
pinKeys.forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.getAttribute('data-key');
    if (key) handlePinKey(key);
  });
});

// Keyboard support on lock screen
document.addEventListener('keydown', (e) => {
  if (!lock.isLocked) return;
  if (e.key >= '0' && e.key <= '9') handlePinKey(e.key);
  else if (e.key === 'Backspace') handlePinKey('delete');
});

// Lock disable button (shown in footer)
lockDisableBtn.onclick = () => {
  if (confirm('Bạn có chắc muốn tắt khoá ứng dụng?')) {
    ipcRenderer.send('save-lock-settings', { enabled: false, hash: '' });
    unlockApp();
  }
};

// ============================================================
//  LOCK SETTINGS MODAL
// ============================================================
const lockSettingsOverlay = document.getElementById('lock-settings-overlay');
const lsToggle = document.getElementById('ls-toggle-lock');
const lsTimeout = document.getElementById('ls-timeout');
const lsChangePin = document.getElementById('ls-change-pin');
const lsRemovePin = document.getElementById('ls-remove-pin');

function openLockSettings() {
  const ls = ipcRenderer.sendSync('get-lock-settings');
  lsToggle.classList.toggle('on', ls.enabled);
  lsTimeout.value = String(ls.timeout || 5);
  lsChangePin.style.display = ls.enabled ? 'block' : 'none';
  lsRemovePin.style.display = ls.enabled ? 'block' : 'none';
  lockSettingsOverlay.style.display = 'flex';
  ipcRenderer.send('set-browserview-visibility', false);
}

lsToggle.onclick = () => {
  const ls = ipcRenderer.sendSync('get-lock-settings');
  if (!ls.enabled) {
    // Enable: show setup PIN
    lockSettingsOverlay.style.display = 'none';
    lockApp('setup');
  } else {
    // Disable
    ipcRenderer.send('save-lock-settings', { enabled: false, hash: '' });
    lsToggle.classList.remove('on');
    lsChangePin.style.display = 'none';
    lsRemovePin.style.display = 'none';
  }
};

lsTimeout.onchange = () => {
  ipcRenderer.send('save-lock-settings', { timeout: parseInt(lsTimeout.value) });
  resetIdleTimer();
};

lsChangePin.onclick = () => {
  lockSettingsOverlay.style.display = 'none';
  lockApp('setup');
};

lsRemovePin.onclick = () => {
  if (confirm('Xoá mã PIN? Khoá ứng dụng sẽ bị tắt.')) {
    ipcRenderer.send('save-lock-settings', { enabled: false, hash: '' });
    lockSettingsOverlay.style.display = 'none';
    ipcRenderer.send('set-browserview-visibility', true);
    lsToggle.classList.remove('on');
  }
};

document.getElementById('ls-close').onclick = () => {
  lockSettingsOverlay.style.display = 'none';
  ipcRenderer.send('set-browserview-visibility', true);
};

// ============================================================
//  IDLE DETECTION — Auto-lock after timeout
// ============================================================
function resetIdleTimer() {
  if (lock.idleTimer) clearTimeout(lock.idleTimer);
  const ls = ipcRenderer.sendSync('get-lock-settings');
  if (ls.enabled && ls.timeout > 0) {
    lock.idleTimer = setTimeout(() => {
      if (!lock.isLocked) lockApp('verify');
    }, ls.timeout * 60 * 1000);
  }
}

['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
  document.addEventListener(evt, () => {
    if (!lock.isLocked) resetIdleTimer();
  }, { passive: true });
});

// ============================================================
//  INIT LOCK — Lock on startup if enabled
// ============================================================
if (settings.appLockEnabled && settings.appLockHash) {
  lockApp('verify');
}
resetIdleTimer();

// ============================================================
//  DOWNLOAD MANAGER MODULE
// ============================================================
const dlPanel = document.getElementById('download-panel');
const dlList = document.getElementById('dl-list');
const dlCount = document.getElementById('dl-count');
const dlEmpty = document.getElementById('dl-empty');
const dlToast = document.getElementById('dl-toast');

let downloads = []; // { id, filename, savePath, total, received, state, done }
let dlPanelOpen = false;

// Toggle download panel
document.getElementById('btn-download').onclick = () => {
  dlPanelOpen = !dlPanelOpen;
  dlPanel.style.display = dlPanelOpen ? 'flex' : 'none';
};
document.getElementById('dl-close').onclick = () => {
  dlPanelOpen = false;
  dlPanel.style.display = 'none';
};

// Close panel when clicking outside
document.addEventListener('click', (e) => {
  if (dlPanelOpen && !dlPanel.contains(e.target) && e.target.id !== 'btn-download' && !e.target.closest('#btn-download')) {
    dlPanelOpen = false;
    dlPanel.style.display = 'none';
  }
});

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const icons = {
    'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'webp': '🖼️', 'svg': '🖼️', 'bmp': '🖼️',
    'mp4': '🎬', 'avi': '🎬', 'mkv': '🎬', 'mov': '🎬', 'webm': '🎬',
    'mp3': '🎵', 'wav': '🎵', 'ogg': '🎵', 'flac': '🎵', 'aac': '🎵',
    'pdf': '📄', 'doc': '📝', 'docx': '📝', 'xls': '📊', 'xlsx': '📊', 'ppt': '📊', 'pptx': '📊',
    'zip': '📦', 'rar': '📦', '7z': '📦', 'tar': '📦', 'gz': '📦',
    'exe': '⚙️', 'msi': '⚙️', 'apk': '📱',
    'txt': '📃', 'json': '📃', 'csv': '📃', 'xml': '📃',
  };
  return icons[ext] || '📎';
}

function showDlToast(msg) {
  dlToast.innerHTML = msg;
  dlToast.classList.add('show');
  setTimeout(() => dlToast.classList.remove('show'), 3000);
}

function renderDownloads() {
  // Update count
  const activeCount = downloads.filter(d => !d.done).length;
  dlCount.textContent = downloads.length;
  dlCount.style.display = downloads.length > 0 ? 'inline' : 'none';
  dlEmpty.style.display = downloads.length === 0 ? 'block' : 'none';

  // Remove existing items (keep empty placeholder)
  dlList.querySelectorAll('.dl-item').forEach(el => el.remove());

  // Render each download (newest first)
  [...downloads].reverse().forEach(dl => {
    const item = document.createElement('div');
    item.className = 'dl-item';
    item.id = `dl-item-${dl.id}`;

    const pct = dl.total > 0 ? Math.round((dl.received / dl.total) * 100) : 0;
    const iconClass = dl.done ? (dl.state === 'completed' ? 'dl-done' : 'dl-error') : '';
    const statusIcon = dl.done ? (dl.state === 'completed' ? '✅' : '❌') : getFileIcon(dl.filename);
    const statusText = dl.done
      ? (dl.state === 'completed' ? 'Hoàn tất' : (dl.state === 'cancelled' ? 'Đã huỷ' : 'Lỗi'))
      : (dl.state === 'interrupted' ? 'Tạm dừng' : `${pct}%`);
    const sizeText = dl.total > 0
      ? `${formatBytes(dl.received)} / ${formatBytes(dl.total)}`
      : (dl.received > 0 ? formatBytes(dl.received) : 'Đang tải...');

    let actionsHtml = '';
    if (dl.done && dl.state === 'completed') {
      actionsHtml = `
        <button class="dl-action-btn" onclick="ipcRenderer.send('open-download-file','${dl.savePath.replace(/\\/g, '\\\\')}')" title="Mở file">
          <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </button>
        <button class="dl-action-btn" onclick="ipcRenderer.send('open-download-folder','${dl.savePath.replace(/\\/g, '\\\\')}')" title="Mở thư mục">
          <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </button>`;
    } else if (!dl.done) {
      actionsHtml = `
        <button class="dl-action-btn" onclick="ipcRenderer.send('cancel-download',${dl.id})" title="Huỷ">
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>`;
    }

    item.innerHTML = `
      <div class="dl-icon ${iconClass}">${statusIcon}</div>
      <div class="dl-info">
        <div class="dl-filename" title="${dl.filename}">${dl.filename}</div>
        <div class="dl-meta"><span>${statusText}</span><span>·</span><span>${sizeText}</span></div>
        ${!dl.done ? `<div class="dl-progress-bar"><div class="dl-progress-fill" style="width:${pct}%"></div></div>` : ''}
      </div>
      <div class="dl-actions">${actionsHtml}</div>`;

    dlList.insertBefore(item, dlEmpty);
  });
}

// IPC: Download events from main process
ipcRenderer.on('download-started', (event, data) => {
  downloads.push({ id: data.id, filename: data.filename, savePath: data.savePath, total: data.total, received: 0, state: 'progressing', done: false });
  renderDownloads();
  // Auto-open panel & show toast
  if (!dlPanelOpen) {
    dlPanelOpen = true;
    dlPanel.style.display = 'flex';
  }
  showDlToast(`⬇️ Bắt đầu tải: <b>${data.filename}</b>`);
});

ipcRenderer.on('download-progress', (event, data) => {
  const dl = downloads.find(d => d.id === data.id);
  if (dl) {
    dl.received = data.received;
    dl.total = data.total || dl.total;
    dl.state = data.state;
    // Update progress bar directly for performance
    const fill = document.querySelector(`#dl-item-${dl.id} .dl-progress-fill`);
    const pct = dl.total > 0 ? Math.round((dl.received / dl.total) * 100) : 0;
    if (fill) {
      fill.style.width = pct + '%';
      const metaSpans = document.querySelectorAll(`#dl-item-${dl.id} .dl-meta span`);
      if (metaSpans[0]) metaSpans[0].textContent = pct + '%';
      if (metaSpans[2]) metaSpans[2].textContent = `${formatBytes(dl.received)} / ${formatBytes(dl.total)}`;
    }
  }
});

ipcRenderer.on('download-done', (event, data) => {
  const dl = downloads.find(d => d.id === data.id);
  if (dl) {
    dl.done = true;
    dl.state = data.state;
    dl.savePath = data.savePath || dl.savePath;
    renderDownloads();
    if (data.state === 'completed') {
      showDlToast(`✅ Đã tải xong: <b>${data.filename}</b>`);
    } else {
      showDlToast(`❌ Tải thất bại: <b>${data.filename}</b>`);
    }
  }
});
