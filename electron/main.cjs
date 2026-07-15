'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray
} = require('electron');
const {
  DEFAULT_WINDOW_STATE,
  loadWindowState,
  normalizeWindowState,
  saveWindowState
} = require('./window-state.cjs');

const APP_NAME = '桌面精灵';
const TOGGLE_VISIBILITY_ACCELERATOR = 'CommandOrControl+Shift+O';
const TOGGLE_CLICK_THROUGH_ACCELERATOR = 'CommandOrControl+Shift+E';
const SETTINGS_KEYS = new Set([
  'alwaysOnTop',
  'clickThrough',
  'idleMotion',
  'idleMessages',
  'voice',
  'codexEnabled',
  'codexNotifications'
]);
const TRAY_ICON_PATH = path.join(__dirname, '..', 'assets', 'trayTemplate.png');
const TRAY_GUID = '2f589ecb-a3a3-4f64-8c5d-3ff961afe030';

let mainWindow = null;
let tray = null;
let stateFilePath = null;
let saveTimer = null;
let isQuitting = false;
let preferences = pickSettings(DEFAULT_WINDOW_STATE);
let codexProgressFilePath = null;
let codexProgress = createEmptyCodexProgress();
let activeCodexProcess = null;

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(initializeApplication).catch((error) => {
    console.error('Failed to initialize desktop spirit:', error);
    app.quit();
  });

  app.on('activate', () => {
    if (!mainWindow) createMainWindow();
    showWindow();
  });

  app.on('window-all-closed', () => {
    // The tray owns the lifecycle; closing the companion only hides it.
  });

  app.on('before-quit', () => {
    isQuitting = true;
    stopCodexProgressWatcher();
    if (activeCodexProcess && !activeCodexProcess.killed) activeCodexProcess.kill();
    persistWindowStateNow();
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
}

async function initializeApplication() {
  app.setName(APP_NAME);
  if (process.platform === 'win32') app.setAppUserModelId('com.codex.desktopspirit');
  if (process.platform === 'darwin' && app.dock) app.dock.hide();

  Menu.setApplicationMenu(null);
  stateFilePath = path.join(app.getPath('userData'), 'desktop-spirit-state.json');
  codexProgressFilePath = path.join(app.getPath('home'), '.codex', 'desktop-spirit-progress.json');
  registerIpcHandlers();
  createMainWindow();
  createTray();
  registerGlobalShortcuts();
  registerDisplayListeners();
  startCodexProgressWatcher();
}

function createEmptyCodexProgress() {
  return {
    task: '等待 Codex 任务',
    status: 'idle',
    message: '安装并信任桌面精灵桥接插件后，任务进度会显示在这里。',
    progress: 0,
    updatedAt: null,
    sessionId: null
  };
}

function pickSettings(source) {
  const next = {};
  for (const key of SETTINGS_KEYS) next[key] = Boolean(source[key]);
  return next;
}

function publicSettings() {
  return { ...preferences };
}

function orderedDisplays() {
  const primaryDisplay = screen.getPrimaryDisplay();
  return [
    primaryDisplay,
    ...screen.getAllDisplays().filter((display) => display.id !== primaryDisplay.id)
  ];
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;

  const loadedState = loadWindowState(stateFilePath, DEFAULT_WINDOW_STATE);
  const restoredState = normalizeWindowState(
    loadedState,
    orderedDisplays(),
    DEFAULT_WINDOW_STATE
  );
  preferences = pickSettings(restoredState);

  mainWindow = new BrowserWindow({
    width: restoredState.width,
    height: restoredState.height,
    x: restoredState.x,
    y: restoredState.y,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    acceptFirstMouse: true,
    title: APP_NAME,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false
    }
  });

  mainWindow.setMenu(null);
  applyAlwaysOnTop(preferences.alwaysOnTop, { publish: false });
  applyClickThrough(preferences.clickThrough, { publish: false });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  mainWindow.webContents.on('did-finish-load', publishSettings);

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.showInactive();
    publishSettings();
  });

  mainWindow.on('move', scheduleWindowStateSave);
  mainWindow.on('show', handleWindowVisibilityChange);
  mainWindow.on('hide', handleWindowVisibilityChange);
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const developmentUrl = process.env.DESKTOP_SPIRIT_DEV_URL;
  if (!app.isPackaged && developmentUrl) {
    mainWindow.loadURL(developmentUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
  return mainWindow;
}

function createTray() {
  if (!fs.existsSync(TRAY_ICON_PATH)) throw new Error(`Tray icon is missing: ${TRAY_ICON_PATH}`);
  const trayImage = nativeImage.createFromPath(TRAY_ICON_PATH);
  trayImage.setTemplateImage(true);
  tray = new Tray(trayImage, TRAY_GUID);
  tray.setToolTip(APP_NAME);
  tray.on('click', toggleWindowVisibility);
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  const isVisible = Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: isVisible ? '隐藏精灵' : '显示精灵', click: toggleWindowVisibility },
    {
      label: '鼠标点击穿透',
      type: 'checkbox',
      checked: preferences.clickThrough,
      click: (item) => applyClickThrough(item.checked)
    },
    {
      label: '窗口置顶',
      type: 'checkbox',
      checked: preferences.alwaysOnTop,
      click: (item) => applyAlwaysOnTop(item.checked)
    },
    { type: 'separator' },
    { label: '重置窗口位置', click: resetWindowPosition },
    { label: `显示/隐藏：${TOGGLE_VISIBILITY_ACCELERATOR}`, enabled: false },
    { label: `切换穿透：${TOGGLE_CLICK_THROUGH_ACCELERATOR}`, enabled: false },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
}

function registerGlobalShortcuts() {
  const shortcuts = [
    [TOGGLE_VISIBILITY_ACCELERATOR, toggleWindowVisibility],
    [TOGGLE_CLICK_THROUGH_ACCELERATOR, () => applyClickThrough(!preferences.clickThrough)]
  ];
  for (const [accelerator, callback] of shortcuts) {
    if (!globalShortcut.register(accelerator, callback)) {
      console.warn(`Global shortcut could not be registered: ${accelerator}`);
    }
  }
}

function registerDisplayListeners() {
  const keepWindowVisible = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const current = { ...preferences, ...mainWindow.getBounds() };
    const normalized = normalizeWindowState(current, orderedDisplays(), DEFAULT_WINDOW_STATE);
    mainWindow.setBounds({
      x: normalized.x,
      y: normalized.y,
      width: normalized.width,
      height: normalized.height
    });
  };
  screen.on('display-removed', keepWindowVisible);
  screen.on('display-metrics-changed', keepWindowVisible);
}

function registerIpcHandlers() {
  ipcMain.handle('spirit:get-settings', (event) => {
    assertTrustedSender(event);
    return publicSettings();
  });

  ipcMain.handle('spirit:update-settings', (event, patch) => {
    assertTrustedSender(event);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new TypeError('Settings patch must be an object.');
    }
    const cleanPatch = {};
    for (const [key, value] of Object.entries(patch)) {
      if (!SETTINGS_KEYS.has(key) || typeof value !== 'boolean') continue;
      cleanPatch[key] = value;
    }
    if ('alwaysOnTop' in cleanPatch) applyAlwaysOnTop(cleanPatch.alwaysOnTop, { publish: false });
    if ('clickThrough' in cleanPatch) applyClickThrough(cleanPatch.clickThrough, { publish: false });
    preferences = { ...preferences, ...cleanPatch };
    scheduleWindowStateSave();
    publishSettings();
    return publicSettings();
  });

  ipcMain.handle('spirit:set-click-through', (event, enabled) => {
    assertTrustedSender(event);
    if (typeof enabled !== 'boolean') throw new TypeError('Expected a boolean.');
    applyClickThrough(enabled);
    return preferences.clickThrough;
  });

  ipcMain.handle('spirit:hide', (event) => {
    assertTrustedSender(event);
    hideWindow();
  });

  ipcMain.handle('spirit:open-tray-menu', (event) => {
    assertTrustedSender(event);
    if (!tray || tray.isDestroyed()) return false;
    tray.popUpContextMenu();
    return true;
  });

  ipcMain.handle('spirit:quit', (event) => {
    assertTrustedSender(event);
    isQuitting = true;
    app.quit();
  });

  ipcMain.handle('spirit:get-codex-status', (event) => {
    assertTrustedSender(event);
    return {
      ...codexProgress,
      available: Boolean(resolveCodexExecutable()),
      progressFile: codexProgressFilePath
    };
  });

  ipcMain.handle('spirit:move-window-by', (event, deltaX, deltaY) => {
    assertTrustedSender(event);
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
      throw new TypeError('Window movement requires finite coordinates.');
    }
    return moveWindowBy(deltaX, deltaY);
  });

  ipcMain.handle('spirit:chat', async (event, message) => {
    assertTrustedSender(event);
    if (typeof message !== 'string') throw new TypeError('Message must be text.');
    const cleanMessage = message.trim().slice(0, 500);
    if (!cleanMessage) throw new TypeError('Message cannot be empty.');
    if (!preferences.codexEnabled) return offlineCompanionReply(cleanMessage);
    try {
      return await codexCompanionReply(cleanMessage);
    } catch (error) {
      console.warn('Local Codex reply failed:', error);
      const fallback = offlineCompanionReply(cleanMessage);
      return {
        ...fallback,
        text: `本地 Codex 暂时没有回应。${fallback.text}`,
        provider: 'offline'
      };
    }
  });
}

function assertTrustedSender(event) {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    throw new Error('Rejected IPC from an unknown renderer.');
  }
}

function offlineCompanionReply(message) {
  if (/累|困|休息|疲惫/.test(message)) {
    return { text: '那就先停两分钟。看远处、喝口水，我会在这里等你。', mood: 'gentle', action: 'rest' };
  }
  if (/你好|早安|晚安|在吗/.test(message)) {
    return { text: '我在，而且状态很好。你现在最想先完成什么？', mood: 'happy', action: 'greet' };
  }
  if (/计划|安排|待办|今天/.test(message)) {
    return { text: '先写下最重要的一件事，再把它拆成一个十分钟内能开始的动作。', mood: 'attentive', action: 'focus' };
  }
  const excerpt = `${message.slice(0, 28)}${message.length > 28 ? '…' : ''}`;
  return {
    text: `我记下了：“${excerpt}”。正式 AI 接入后，我会结合上下文继续回应。`,
    mood: 'curious',
    action: 'listen'
  };
}

function publishSettings() {
  rebuildTrayMenu();
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send('spirit:settings-changed', publicSettings());
}

function handleWindowVisibilityChange() {
  rebuildTrayMenu();
  publishSettings();
}

function showWindow() {
  if (!app.isReady()) return;
  const window = createMainWindow();
  if (preferences.clickThrough) {
    window.showInactive();
  } else {
    window.show();
    window.focus();
  }
  publishSettings();
}

function hideWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.hide();
  publishSettings();
}

function toggleWindowVisibility() {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) showWindow();
  else hideWindow();
}

function moveWindowBy(deltaX, deltaY) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const bounds = mainWindow.getBounds();
  const limitedX = Math.max(-800, Math.min(800, Math.round(deltaX)));
  const limitedY = Math.max(-800, Math.min(800, Math.round(deltaY)));
  const x = bounds.x + limitedX;
  const y = bounds.y + limitedY;
  mainWindow.setPosition(x, y, false);
  scheduleWindowStateSave();
  return { x, y };
}

function resolveCodexExecutable() {
  const candidates = [
    process.env.CODEX_PATH,
    '/Applications/ChatGPT.app/Contents/Resources/codex',
    '/Applications/Codex.app/Contents/Resources/codex',
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
    path.join(app.getPath('home'), '.local', 'bin', 'codex')
  ].filter(Boolean);
  return candidates.find((candidate) => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }) || null;
}

function codexCompanionReply(message) {
  const executable = resolveCodexExecutable();
  if (!executable) throw new Error('Codex CLI is not installed.');
  const runDirectory = fs.mkdtempSync(path.join(app.getPath('temp'), 'desktop-spirit-codex-'));
  const outputPath = path.join(runDirectory, 'reply.txt');
  const prompt = [
    '你是一个简洁、温柔但不幼稚的中文桌面陪伴精灵。',
    '只回答用户当前这句话，不读取文件、不运行命令、不修改系统。',
    '回答控制在 120 个汉字以内，直接给出有帮助的回复。',
    `用户：${message}`
  ].join('\n');

  publishCodexProgress({
    task: '桌宠正在询问本地 Codex',
    status: 'running',
    message: message.slice(0, 80),
    progress: 30,
    updatedAt: new Date().toISOString(),
    sessionId: 'desktop-spirit-chat'
  }, { reveal: false });

  return new Promise((resolve, reject) => {
    const child = spawn(executable, [
      '-a', 'never',
      'exec',
      '--ephemeral',
      '--ignore-user-config',
      '--skip-git-repo-check',
      '--sandbox', 'read-only',
      '--output-last-message', outputPath,
      prompt
    ], {
      cwd: runDirectory,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'ignore', 'pipe']
    });
    activeCodexProcess = child;
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 4000) stderr += chunk.toString();
    });
    const timeout = setTimeout(() => child.kill(), 90000);
    child.once('error', reject);
    child.once('close', (code) => {
      clearTimeout(timeout);
      activeCodexProcess = null;
      try {
        if (code !== 0) throw new Error(stderr.trim() || `Codex exited with ${code}.`);
        const text = fs.readFileSync(outputPath, 'utf8').trim().slice(0, 500);
        if (!text) throw new Error('Codex returned an empty reply.');
        publishCodexProgress({
          task: '桌宠 Codex 对话',
          status: 'completed',
          message: '回复已完成',
          progress: 100,
          updatedAt: new Date().toISOString(),
          sessionId: 'desktop-spirit-chat'
        }, { reveal: false });
        resolve({ text, mood: 'attentive', action: 'codex', provider: 'codex' });
      } catch (error) {
        reject(error);
      } finally {
        fs.rmSync(runDirectory, { recursive: true, force: true });
      }
    });
  });
}

function normalizeCodexProgress(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return createEmptyCodexProgress();
  const allowedStatuses = new Set(['idle', 'running', 'waiting', 'completed', 'failed']);
  const progress = Number(value.progress);
  return {
    task: typeof value.task === 'string' ? value.task.slice(0, 120) : 'Codex 任务',
    status: allowedStatuses.has(value.status) ? value.status : 'running',
    message: typeof value.message === 'string' ? value.message.slice(0, 260) : '',
    progress: Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : 0,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
    sessionId: typeof value.sessionId === 'string' ? value.sessionId.slice(0, 100) : null
  };
}

function readCodexProgressFile() {
  if (!codexProgressFilePath) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(codexProgressFilePath, 'utf8'));
    const next = normalizeCodexProgress(parsed);
    if (next.updatedAt === codexProgress.updatedAt && next.status === codexProgress.status) return;
    publishCodexProgress(next);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.name !== 'SyntaxError') {
      console.warn('Could not read Codex progress:', error);
    }
  }
}

function publishCodexProgress(next, options = {}) {
  codexProgress = normalizeCodexProgress(next);
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send('spirit:codex-progress', {
    ...codexProgress,
    available: Boolean(resolveCodexExecutable()),
    progressFile: codexProgressFilePath
  });
  const shouldReveal = options.reveal !== false && preferences.codexNotifications &&
    ['waiting', 'completed', 'failed'].includes(codexProgress.status);
  if (shouldReveal && !mainWindow.isVisible()) mainWindow.showInactive();
}

function startCodexProgressWatcher() {
  if (!codexProgressFilePath) return;
  fs.mkdirSync(path.dirname(codexProgressFilePath), { recursive: true });
  readCodexProgressFile();
  fs.watchFile(codexProgressFilePath, { interval: 900, persistent: false }, readCodexProgressFile);
}

function stopCodexProgressWatcher() {
  if (codexProgressFilePath) fs.unwatchFile(codexProgressFilePath, readCodexProgressFile);
}

function applyClickThrough(enabled, options = {}) {
  preferences.clickThrough = Boolean(enabled);
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (preferences.clickThrough) mainWindow.setIgnoreMouseEvents(true, { forward: true });
    else mainWindow.setIgnoreMouseEvents(false);
  }
  scheduleWindowStateSave();
  if (options.publish !== false) publishSettings();
}

function applyAlwaysOnTop(enabled, options = {}) {
  preferences.alwaysOnTop = Boolean(enabled);
  if (mainWindow && !mainWindow.isDestroyed()) {
    const level = process.platform === 'darwin' && preferences.alwaysOnTop ? 'floating' : 'normal';
    mainWindow.setAlwaysOnTop(preferences.alwaysOnTop, level);
    if (process.platform === 'darwin') {
      mainWindow.setVisibleOnAllWorkspaces(preferences.alwaysOnTop, {
        visibleOnFullScreen: preferences.alwaysOnTop,
        skipTransformProcessType: true
      });
    }
  }
  scheduleWindowStateSave();
  if (options.publish !== false) publishSettings();
}

function resetWindowPosition() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const normalized = normalizeWindowState(preferences, orderedDisplays(), DEFAULT_WINDOW_STATE);
  mainWindow.setBounds({
    x: normalized.x,
    y: normalized.y,
    width: normalized.width,
    height: normalized.height
  });
  persistWindowStateNow();
  publishSettings();
}

function scheduleWindowStateSave() {
  if (!stateFilePath) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistWindowStateNow, 250);
}

function persistWindowStateNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!stateFilePath || !mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  try {
    saveWindowState(stateFilePath, {
      ...preferences,
      x: bounds.x,
      y: bounds.y
    });
  } catch (error) {
    console.warn('Could not persist desktop spirit state:', error);
  }
}
