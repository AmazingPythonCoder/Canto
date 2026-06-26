import { app, BrowserWindow, Menu, ipcMain, nativeTheme } from 'electron';
import * as path from 'path';
import { TabManager } from './services/TabManager';
import { SessionManager } from './services/SessionManager';
import { DatabaseManager } from './services/DatabaseManager';
import { SettingsManager, SEARCH_ENGINES } from './services/SettingsManager';

let mainWindow: BrowserWindow | null = null;
let tabManager: TabManager | null = null;
let sessionManager: SessionManager | null = null;
let db: DatabaseManager | null = null;
let settings: SettingsManager | null = null;

// Force dark mode in all WebContentsViews
nativeTheme.themeSource = 'dark';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const NEW_TAB_URL = isDev
  ? 'http://localhost:5173/new-tab.html'
  : `file://${path.join(__dirname, '../renderer/new-tab.html')}`;

function normalizeUrl(input: string, settingsMgr?: SettingsManager | null): string {
  const trimmed = input.trim();
  if (!trimmed) return 'about:blank';

  // Internal browser pages pass through as-is
  if (trimmed.startsWith('browser://')) return trimmed;

  // Already has a scheme
  if (/^[a-zA-Z0-9+\-.]+:\/\//.test(trimmed)) return trimmed;

  // Spaces → search
  if (trimmed.includes(' ')) {
    return settingsMgr?.buildSearchUrl(trimmed)
      ?? `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }

  // Host part looks like a domain/localhost
  const hostPart = trimmed.split(/[/:]/)[0];
  const domainPattern = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/;
  if (hostPart === 'localhost' || domainPattern.test(hostPart)) {
    return `${hostPart === 'localhost' ? 'http' : 'https'}://${trimmed}`;
  }

  // Fallback: search
  return settingsMgr?.buildSearchUrl(trimmed)
    ?? `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Tabs',
      submenu: [
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => tabManager?.createTab() },
        { label: 'Reopen Closed Tab', accelerator: 'CmdOrCtrl+Shift+T', click: () => tabManager?.reopenLastClosedTab() },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => {
          const id = tabManager?.getActiveTabId();
          if (id != null) tabManager?.closeTab(id);
        }},
        { type: 'separator' },
        { label: 'Next Tab', accelerator: 'CmdOrCtrl+Tab', click: () => tabManager?.activateNextTab() },
        { label: 'Previous Tab', accelerator: 'CmdOrCtrl+Shift+Tab', click: () => tabManager?.activatePrevTab() },
        { label: 'Tab 1', accelerator: 'CmdOrCtrl+1', click: () => tabManager?.activateTabByIndex(0) },
        { label: 'Tab 2', accelerator: 'CmdOrCtrl+2', click: () => tabManager?.activateTabByIndex(1) },
        { label: 'Tab 3', accelerator: 'CmdOrCtrl+3', click: () => tabManager?.activateTabByIndex(2) },
        { label: 'Tab 4', accelerator: 'CmdOrCtrl+4', click: () => tabManager?.activateTabByIndex(3) },
        { label: 'Tab 5', accelerator: 'CmdOrCtrl+5', click: () => tabManager?.activateTabByIndex(4) },
        { label: 'Tab 6', accelerator: 'CmdOrCtrl+6', click: () => tabManager?.activateTabByIndex(5) },
        { label: 'Tab 7', accelerator: 'CmdOrCtrl+7', click: () => tabManager?.activateTabByIndex(6) },
        { label: 'Tab 8', accelerator: 'CmdOrCtrl+8', click: () => tabManager?.activateTabByIndex(7) },
        { label: 'Last Tab', accelerator: 'CmdOrCtrl+9', click: () => tabManager?.activateTabByIndex(-1) },
        { type: 'separator' },
        { label: 'Search Tabs', accelerator: 'CmdOrCtrl+Shift+A', click: () => mainWindow?.webContents.send('trigger-tab-search') },
        { label: 'Save Session', accelerator: 'CmdOrCtrl+Shift+S', click: () => mainWindow?.webContents.send('sessions:save-shortcut') },
      ]
    },
    {
      label: 'Navigation',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => tabManager?.activeTabReload() },
        { label: 'Hard Reload', accelerator: 'CmdOrCtrl+Shift+R', click: () => tabManager?.hardReloadActiveTab() },
        { label: 'Focus Address Bar', accelerator: 'CmdOrCtrl+L', click: () => mainWindow?.webContents.send('focus-address-bar') },
        { label: 'Bookmark Page', accelerator: 'CmdOrCtrl+D', click: () => mainWindow?.webContents.send('bookmark-toggle') },
        { label: 'Find in Page', accelerator: 'CmdOrCtrl+F', click: () => mainWindow?.webContents.send('find:open') },
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => tabManager?.zoomActiveTab('in') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => tabManager?.zoomActiveTab('out') },
        { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', click: () => tabManager?.zoomActiveTab('reset') },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => tabManager?.createTab('browser://settings', true) },
      ]
    },
    {
      label: 'Developer',
      submenu: [
        { label: 'Toggle DevTools', accelerator: 'F12', click: () => mainWindow?.webContents.toggleDevTools() },
        { label: 'Reload UI', accelerator: 'CmdOrCtrl+Shift+U', click: () => mainWindow?.webContents.reload() },
      ]
    }
  ] as any);
}

function createWindow() {
  db = new DatabaseManager();
  settings = new SettingsManager();
  sessionManager = new SessionManager();

  const hasCrashed = sessionManager.checkCrashStatus();
  sessionManager.createLockfile();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    frame: false,
    backgroundColor: '#1f1f1e',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const preloadPath = path.join(__dirname, '../preload/preload.js');
  tabManager = new TabManager(mainWindow, preloadPath, NEW_TAB_URL, db);

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('resize', () => tabManager?.updateBounds());
  mainWindow.once('ready-to-show', () => {
    tabManager?.updateBounds();
    if (hasCrashed) mainWindow?.webContents.send('show-crash-restore-prompt');
  });

  sessionManager.startAutoSave(tabManager);
  Menu.setApplicationMenu(buildMenu());

  // Prevent the shell renderer from navigating away
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  mainWindow.on('close', () => {
    if (tabManager && sessionManager) {
      sessionManager.saveAutoSession(tabManager);
      sessionManager.deleteLockfile();
      sessionManager.cleanup();
    }
    db?.close();
  });

  mainWindow.on('closed', () => { mainWindow = null; tabManager = null; });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ── Window controls ───────────────────────────────────────────────────────────
ipcMain.on('window-control', (_, action) => {
  if (!mainWindow) return;
  if (action === 'minimize') mainWindow.minimize();
  else if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  else if (action === 'close') mainWindow.close();
});

// ── Navigation ────────────────────────────────────────────────────────────────
ipcMain.on('navigation', (_, data) => {
  if (!tabManager) return;
  if (data.action === 'navigate') tabManager.navigateActiveTab(normalizeUrl(data.input, settings));
  else if (data.action === 'back') tabManager.activeTabBack();
  else if (data.action === 'forward') tabManager.activeTabForward();
  else if (data.action === 'reload') tabManager.activeTabReload();
});

// ── Tabs ──────────────────────────────────────────────────────────────────────
ipcMain.on('tabs:create', (_, data) => tabManager?.createTab(data?.url, data?.activate ?? true));
ipcMain.on('tabs:activate', (_, id) => tabManager?.activateTab(id));
ipcMain.on('tabs:close', (_, id) => tabManager?.closeTab(id));
ipcMain.on('tabs:show-context-menu', (_, id) => tabManager?.showTabContextMenu(id));
ipcMain.on('tabs:request-initial-state', () => {
  if (tabManager) {
    tabManager.getTabs().length === 0 ? tabManager.createTab(NEW_TAB_URL, true) : tabManager.pushState();
  }
});

// ── Groups ────────────────────────────────────────────────────────────────────
ipcMain.on('groups:show-context-menu', (_, groupId) => tabManager?.showGroupContextMenu(groupId));
ipcMain.on('groups:toggle-collapse', (_, groupId) => tabManager?.toggleGroupCollapse(groupId));
ipcMain.on('groups:set-name', (_, { groupId, name }) => tabManager?.setGroupName(groupId, name));
ipcMain.on('groups:set-color', (_, { groupId, color }) => tabManager?.setGroupColor(groupId, color));

// ── Sessions ──────────────────────────────────────────────────────────────────
ipcMain.handle('sessions:list', () => sessionManager?.listSessions() || []);
ipcMain.on('sessions:save', (_, name) => {
  if (tabManager && sessionManager) {
    sessionManager.saveSession(name, tabManager.getTabs(), tabManager.getGroups());
    mainWindow?.webContents.send('sessions:updated');
  }
});
ipcMain.on('sessions:delete', (_, name) => {
  sessionManager?.deleteSession(name);
  mainWindow?.webContents.send('sessions:updated');
});
ipcMain.on('sessions:load', (_, name) => {
  if (tabManager && sessionManager) sessionManager.loadSession(name, tabManager);
});
ipcMain.on('sessions:restore-auto', () => {
  if (tabManager && sessionManager) { sessionManager.restoreAutoSession(tabManager); sessionManager.deleteLockfile(); }
});
ipcMain.on('sessions:dismiss-crash', () => sessionManager?.deleteLockfile());

// Save session via keyboard shortcut
ipcMain.on('sessions:save-via-shortcut', () => {
  if (tabManager && sessionManager) {
    const ts = new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    sessionManager.saveSession(`Session ${ts}`, tabManager.getTabs(), tabManager.getGroups());
    mainWindow?.webContents.send('sessions:updated');
  }
});

// ── Omnibox ───────────────────────────────────────────────────────────────────
ipcMain.handle('omnibox:query', (_, query: string) => {
  if (!db || !query.trim()) return [];
  const bookmarks = db.queryBookmarks(query, 4).map(b => ({ url: b.url, title: b.title, type: 'bookmark' as const }));
  const seen = new Set(bookmarks.map(b => b.url));
  const history = db.queryHistory(query, 8)
    .filter(h => !seen.has(h.url))
    .map(h => ({ url: h.url, title: h.title, type: 'history' as const }));
  return [...bookmarks, ...history].slice(0, 10);
});

// ── Bookmarks ─────────────────────────────────────────────────────────────────
ipcMain.handle('bookmark:check', (_, url: string) => db?.isBookmarked(url) ?? false);
ipcMain.on('bookmark:toggle', (_, data: { url: string; title: string; favicon: string }) => {
  if (!db) return;
  if (db.isBookmarked(data.url)) {
    db.removeBookmark(data.url);
  } else {
    db.addBookmark(data.url, data.title, data.favicon);
  }
  mainWindow?.webContents.send('bookmark:changed', { url: data.url, isBookmarked: db.isBookmarked(data.url) });
});

// ── Find in page ──────────────────────────────────────────────────────────────
ipcMain.on('find:start', (_, data: { query: string; forward: boolean }) => {
  tabManager?.findInPage(data.query, data.forward);
});
ipcMain.on('find:stop', () => tabManager?.stopFindInPage());

// ── Zoom ──────────────────────────────────────────────────────────────────────
ipcMain.on('zoom:change', (_, direction: 'in' | 'out' | 'reset') => tabManager?.zoomActiveTab(direction));

// ── Settings ──────────────────────────────────────────────────────────────────
ipcMain.handle('settings:get-all', () => ({
  settings: settings?.getAll() ?? {},
  searchEngines: Object.entries(SEARCH_ENGINES).map(([key, val]) => ({ key, name: val.name }))
}));
ipcMain.on('settings:set', (_, data: { key: string; value: any }) => {
  settings?.set(data.key as any, data.value);
  mainWindow?.webContents.send('settings:changed');
});
