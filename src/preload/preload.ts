import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('browserAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-control', 'minimize'),
  maximize: () => ipcRenderer.send('window-control', 'maximize'),
  close:    () => ipcRenderer.send('window-control', 'close'),

  // Navigation
  navigate: (input: string) => ipcRenderer.send('navigation', { action: 'navigate', input }),
  back:     () => ipcRenderer.send('navigation', { action: 'back' }),
  forward:  () => ipcRenderer.send('navigation', { action: 'forward' }),
  reload:   () => ipcRenderer.send('navigation', { action: 'reload' }),

  // Tabs
  createTab:          (url?: string, activate?: boolean) => ipcRenderer.send('tabs:create', { url, activate }),
  activateTab:        (id: number) => ipcRenderer.send('tabs:activate', id),
  closeTab:           (id: number) => ipcRenderer.send('tabs:close', id),
  showTabContextMenu: (id: number) => ipcRenderer.send('tabs:show-context-menu', id),
  requestInitialTabState: () => ipcRenderer.send('tabs:request-initial-state'),

  // Groups
  showGroupContextMenu: (groupId: string) => ipcRenderer.send('groups:show-context-menu', groupId),
  toggleGroupCollapse:  (groupId: string) => ipcRenderer.send('groups:toggle-collapse', groupId),
  setGroupName:  (groupId: string, name: string)  => ipcRenderer.send('groups:set-name', { groupId, name }),
  setGroupColor: (groupId: string, color: string) => ipcRenderer.send('groups:set-color', { groupId, color }),

  // Sessions
  listSessions:     (): Promise<any[]> => ipcRenderer.invoke('sessions:list'),
  saveSession:      (name: string) => ipcRenderer.send('sessions:save', name),
  saveSessionShortcut: () => ipcRenderer.send('sessions:save-via-shortcut'),
  deleteSession:    (name: string) => ipcRenderer.send('sessions:delete', name),
  loadSession:      (name: string) => ipcRenderer.send('sessions:load', name),
  restoreAutoSession: () => ipcRenderer.send('sessions:restore-auto'),
  dismissCrash:     () => ipcRenderer.send('sessions:dismiss-crash'),

  // Omnibox
  queryOmnibox: (query: string): Promise<Array<{ url: string; title: string; type: 'history' | 'bookmark' }>> =>
    ipcRenderer.invoke('omnibox:query', query),

  // Bookmarks
  checkBookmark:  (url: string): Promise<boolean> => ipcRenderer.invoke('bookmark:check', url),
  toggleBookmark: (data: { url: string; title: string; favicon: string }) =>
    ipcRenderer.send('bookmark:toggle', data),

  // Find in page
  findStart: (query: string, forward: boolean) => ipcRenderer.send('find:start', { query, forward }),
  findStop:  () => ipcRenderer.send('find:stop'),

  // Zoom
  zoomChange: (direction: 'in' | 'out' | 'reset') => ipcRenderer.send('zoom:change', direction),

  // Settings
  getAllSettings: (): Promise<{ settings: any; searchEngines: Array<{ key: string; name: string }> }> =>
    ipcRenderer.invoke('settings:get-all'),
  setSetting: (key: string, value: any) => ipcRenderer.send('settings:set', { key, value }),

  // ── Listeners ────────────────────────────────────────────────

  onTabStateUpdate: (cb: (event: any, data: any) => void) => {
    ipcRenderer.on('tab-state-update', cb);
    return () => ipcRenderer.removeListener('tab-state-update', cb);
  },
  onTriggerTabSearch: (cb: (event: any) => void) => {
    ipcRenderer.on('trigger-tab-search', cb);
    return () => ipcRenderer.removeListener('trigger-tab-search', cb);
  },
  onShowCrashPrompt: (cb: (event: any) => void) => {
    ipcRenderer.on('show-crash-restore-prompt', cb);
    return () => ipcRenderer.removeListener('show-crash-restore-prompt', cb);
  },
  onSessionsUpdated: (cb: (event: any) => void) => {
    ipcRenderer.on('sessions:updated', cb);
    return () => ipcRenderer.removeListener('sessions:updated', cb);
  },
  onFocusAddressBar: (cb: (event: any) => void) => {
    ipcRenderer.on('focus-address-bar', cb);
    return () => ipcRenderer.removeListener('focus-address-bar', cb);
  },
  onFindOpen: (cb: (event: any) => void) => {
    ipcRenderer.on('find:open', cb);
    return () => ipcRenderer.removeListener('find:open', cb);
  },
  onFindClose: (cb: (event: any) => void) => {
    ipcRenderer.on('find:close', cb);
    return () => ipcRenderer.removeListener('find:close', cb);
  },
  onFindResult: (cb: (event: any, data: { activeMatchOrdinal: number; matches: number }) => void) => {
    ipcRenderer.on('find:result', cb);
    return () => ipcRenderer.removeListener('find:result', cb);
  },
  onBookmarkChanged: (cb: (event: any, data: { url: string; isBookmarked: boolean }) => void) => {
    ipcRenderer.on('bookmark:changed', cb);
    return () => ipcRenderer.removeListener('bookmark:changed', cb);
  },
  onBookmarkToggleRequest: (cb: (event: any) => void) => {
    ipcRenderer.on('bookmark-toggle', cb);
    return () => ipcRenderer.removeListener('bookmark-toggle', cb);
  },
  onSaveSessionShortcut: (cb: (event: any) => void) => {
    ipcRenderer.on('sessions:save-shortcut', cb);
    return () => ipcRenderer.removeListener('sessions:save-shortcut', cb);
  },
  onSettingsChanged: (cb: (event: any) => void) => {
    ipcRenderer.on('settings:changed', cb);
    return () => ipcRenderer.removeListener('settings:changed', cb);
  },

  // Legacy (kept for compatibility)
  onNavigationUpdate: (cb: (event: any, data: any) => void) => {
    ipcRenderer.on('navigation-update', cb);
    return () => ipcRenderer.removeListener('navigation-update', cb);
  },
});
