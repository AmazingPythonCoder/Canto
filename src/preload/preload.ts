import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('browserAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-control', 'minimize'),
  maximize: () => ipcRenderer.send('window-control', 'maximize'),
  close: () => ipcRenderer.send('window-control', 'close'),
  
  // Navigation (from toolbar input)
  navigate: (input: string) => ipcRenderer.send('navigation', { action: 'navigate', input }),
  back: () => ipcRenderer.send('navigation', { action: 'back' }),
  forward: () => ipcRenderer.send('navigation', { action: 'forward' }),
  reload: () => ipcRenderer.send('navigation', { action: 'reload' }),
  
  // Tab Controls
  createTab: (url?: string, activate?: boolean) => ipcRenderer.send('tabs:create', { url, activate }),
  activateTab: (id: number) => ipcRenderer.send('tabs:activate', id),
  closeTab: (id: number) => ipcRenderer.send('tabs:close', id),
  showTabContextMenu: (id: number) => ipcRenderer.send('tabs:show-context-menu', id),
  requestInitialTabState: () => ipcRenderer.send('tabs:request-initial-state'),

  // Group Controls
  showGroupContextMenu: (groupId: string) => ipcRenderer.send('groups:show-context-menu', groupId),
  toggleGroupCollapse: (groupId: string) => ipcRenderer.send('groups:toggle-collapse', groupId),
  setGroupName: (groupId: string, name: string) => ipcRenderer.send('groups:set-name', { groupId, name }),
  setGroupColor: (groupId: string, color: string) => ipcRenderer.send('groups:set-color', { groupId, color }),

  // Session Controls
  listSessions: () => ipcRenderer.invoke('sessions:list'),
  saveSession: (name: string) => ipcRenderer.send('sessions:save', name),
  deleteSession: (name: string) => ipcRenderer.send('sessions:delete', name),
  loadSession: (name: string) => ipcRenderer.send('sessions:load', name),
  restoreAutoSession: () => ipcRenderer.send('sessions:restore-auto'),
  dismissCrash: () => ipcRenderer.send('sessions:dismiss-crash'),

  // General Listeners
  onNavigationUpdate: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('navigation-update', callback);
    return () => {
      ipcRenderer.removeListener('navigation-update', callback);
    };
  },
  
  onTabStateUpdate: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('tab-state-update', callback);
    return () => {
      ipcRenderer.removeListener('tab-state-update', callback);
    };
  },

  onTriggerTabSearch: (callback: (event: any) => void) => {
    ipcRenderer.on('trigger-tab-search', callback);
    return () => {
      ipcRenderer.removeListener('trigger-tab-search', callback);
    };
  },

  onShowCrashPrompt: (callback: (event: any) => void) => {
    ipcRenderer.on('show-crash-restore-prompt', callback);
    return () => {
      ipcRenderer.removeListener('show-crash-restore-prompt', callback);
    };
  },

  onSessionsUpdated: (callback: (event: any) => void) => {
    ipcRenderer.on('sessions:updated', callback);
    return () => {
      ipcRenderer.removeListener('sessions:updated', callback);
    };
  }
});
