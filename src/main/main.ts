import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import * as path from 'path';
import { TabManager } from './services/TabManager';
import { SessionManager } from './services/SessionManager';

let mainWindow: BrowserWindow | null = null;
let tabManager: TabManager | null = null;
let sessionManager: SessionManager | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const NEW_TAB_URL = isDev
  ? 'http://localhost:5173/new-tab.html'
  : `file://${path.join(__dirname, '../renderer/new-tab.html')}`;

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return 'about:blank';
  }

  // If it has spaces, treat as a search query
  if (trimmed.includes(' ')) {
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }

  // If it already has a scheme, pass it through
  if (/^[a-zA-Z0-9+-.]+:\/\//.test(trimmed)) {
    return trimmed;
  }

  // Split by path/port separator to check the host name part
  const hostPart = trimmed.split(/[\/:]/)[0];
  
  // Custom check for localhost or standard domain patterns
  const domainPattern = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/;
  if (hostPart === 'localhost' || domainPattern.test(hostPart)) {
    const scheme = hostPart === 'localhost' ? 'http' : 'https';
    return `${scheme}://${trimmed}`;
  }

  // Fallback to search query
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function createWindow() {
  sessionManager = new SessionManager();

  // Check if we crashed
  const hasCrashed = sessionManager.checkCrashStatus();
  
  // Create lockfile immediately
  sessionManager.createLockfile();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false, // custom titlebar frame
    backgroundColor: '#0a0b0d', // dark theme background matching renderer css
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const preloadPath = path.join(__dirname, '../preload/preload.js');
  tabManager = new TabManager(mainWindow, preloadPath, NEW_TAB_URL);

  // Load React shell
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Position viewport on resize
  mainWindow.on('resize', () => {
    tabManager?.updateBounds();
  });

  mainWindow.once('ready-to-show', () => {
    tabManager?.updateBounds();
    
    // Check if we should notify renderer about crash recovery
    if (hasCrashed) {
      mainWindow?.webContents.send('show-crash-restore-prompt');
    }
  });

  // Start auto-saving session every 5 minutes
  sessionManager.startAutoSave(tabManager);

  // Set up Application Menu with key accelerators
  const menuTemplate = [
    {
      label: 'Tabs',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => tabManager?.createTab()
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            const activeId = tabManager?.getActiveTabId();
            if (activeId !== undefined && activeId !== null) {
              tabManager?.closeTab(activeId);
            }
          }
        },
        {
          label: 'Next Tab',
          accelerator: 'CmdOrCtrl+Tab',
          click: () => tabManager?.activateNextTab()
        },
        {
          label: 'Previous Tab',
          accelerator: 'CmdOrCtrl+Shift+Tab',
          click: () => tabManager?.activatePrevTab()
        },
        {
          label: 'Search Tabs',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => {
            mainWindow?.webContents.send('trigger-tab-search');
          }
        }
      ]
    },
    {
      label: 'Developer',
      submenu: [
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: () => {
            mainWindow?.webContents.toggleDevTools();
          }
        },
        {
          label: 'Reload UI',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            mainWindow?.webContents.reload();
          }
        }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(menuTemplate as any);
  Menu.setApplicationMenu(menu);

  // Security guard on main window navigation
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  // Handle close cleanup
  mainWindow.on('close', () => {
    if (tabManager && sessionManager) {
      sessionManager.saveAutoSession(tabManager);
      sessionManager.deleteLockfile();
      sessionManager.cleanup();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    tabManager = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handler Registrations
ipcMain.on('window-control', (event, action) => {
  if (!mainWindow) return;
  if (action === 'minimize') {
    mainWindow.minimize();
  } else if (action === 'maximize') {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  } else if (action === 'close') {
    mainWindow.close();
  }
});

ipcMain.on('navigation', (event, data) => {
  if (!tabManager) return;
  if (data.action === 'navigate') {
    tabManager.navigateActiveTab(normalizeUrl(data.input));
  } else if (data.action === 'back') {
    tabManager.activeTabBack();
  } else if (data.action === 'forward') {
    tabManager.activeTabForward();
  } else if (data.action === 'reload') {
    tabManager.activeTabReload();
  }
});

// Tab management IPCs
ipcMain.on('tabs:create', (event, data) => {
  tabManager?.createTab(data?.url, data?.activate ?? true);
});

ipcMain.on('tabs:activate', (event, id) => {
  tabManager?.activateTab(id);
});

ipcMain.on('tabs:close', (event, id) => {
  tabManager?.closeTab(id);
});

ipcMain.on('tabs:show-context-menu', (event, id) => {
  tabManager?.showTabContextMenu(id);
});

ipcMain.on('groups:show-context-menu', (event, groupId) => {
  tabManager?.showGroupContextMenu(groupId);
});

ipcMain.on('groups:toggle-collapse', (event, groupId) => {
  tabManager?.toggleGroupCollapse(groupId);
});

ipcMain.on('groups:set-name', (event, { groupId, name }) => {
  tabManager?.setGroupName(groupId, name);
});

ipcMain.on('groups:set-color', (event, { groupId, color }) => {
  tabManager?.setGroupColor(groupId, color);
});

// Session IPCs (using async handlers)
ipcMain.handle('sessions:list', () => {
  return sessionManager?.listSessions() || [];
});

ipcMain.on('sessions:save', (event, name) => {
  if (tabManager && sessionManager) {
    sessionManager.saveSession(name, tabManager.getTabs(), tabManager.getGroups());
    mainWindow?.webContents.send('sessions:updated');
  }
});

ipcMain.on('sessions:delete', (event, name) => {
  if (sessionManager) {
    sessionManager.deleteSession(name);
    mainWindow?.webContents.send('sessions:updated');
  }
});

ipcMain.on('sessions:load', (event, name) => {
  if (tabManager && sessionManager) {
    sessionManager.loadSession(name, tabManager);
  }
});

ipcMain.on('sessions:restore-auto', () => {
  if (tabManager && sessionManager) {
    sessionManager.restoreAutoSession(tabManager);
    sessionManager.deleteLockfile();
  }
});

ipcMain.on('sessions:dismiss-crash', () => {
  sessionManager?.deleteLockfile();
});

// Request initial tab state push
ipcMain.on('tabs:request-initial-state', () => {
  if (tabManager) {
    if (tabManager.getTabs().length === 0) {
      tabManager.createTab(NEW_TAB_URL, true);
    } else {
      tabManager.pushState();
    }
  }
});
