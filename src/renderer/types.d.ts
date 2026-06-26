export interface Tab {
  id: number;
  url: string;
  title: string;
  favicon: string;
  isActive: boolean;
  groupId: string | null;
  lastActive: number;
  isLoading: boolean;
  zoomFactor: number;
  isInternal: boolean;
}

export interface TabGroup {
  id: string;
  name: string;
  color: string;
  isCollapsed: boolean;
}

export interface SessionMetadata {
  name: string;
  tabCount: number;
  saveDate: number;
}

export interface OmniboxSuggestion {
  url: string;
  title: string;
  type: 'history' | 'bookmark';
}

export interface FindResult {
  activeMatchOrdinal: number;
  matches: number;
}

export interface AppSettings {
  searchEngine: string;
  homepage: 'newtab' | 'blank' | 'custom';
  homepageUrl: string;
  defaultZoom: number;
  adBlockerEnabled: boolean;
  readingModeAuto: boolean;
  searchSuggestionsEnabled: boolean;
  shortcuts: Record<string, string>;
}

export interface BrowserAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;

  navigate: (input: string) => void;
  back: () => void;
  forward: () => void;
  reload: () => void;

  createTab: (url?: string, activate?: boolean) => void;
  activateTab: (id: number) => void;
  closeTab: (id: number) => void;
  showTabContextMenu: (id: number) => void;
  requestInitialTabState: () => void;

  showGroupContextMenu: (groupId: string) => void;
  toggleGroupCollapse: (groupId: string) => void;
  setGroupName: (groupId: string, name: string) => void;
  setGroupColor: (groupId: string, color: string) => void;

  listSessions: () => Promise<SessionMetadata[]>;
  saveSession: (name: string) => void;
  saveSessionShortcut: () => void;
  deleteSession: (name: string) => void;
  loadSession: (name: string) => void;
  restoreAutoSession: () => void;
  dismissCrash: () => void;

  queryOmnibox: (query: string) => Promise<OmniboxSuggestion[]>;

  checkBookmark: (url: string) => Promise<boolean>;
  toggleBookmark: (data: { url: string; title: string; favicon: string }) => void;

  findStart: (query: string, forward: boolean) => void;
  findStop: () => void;

  zoomChange: (direction: 'in' | 'out' | 'reset') => void;

  getAllSettings: () => Promise<{ settings: AppSettings; searchEngines: Array<{ key: string; name: string }> }>;
  setSetting: (key: string, value: any) => void;

  onTabStateUpdate: (cb: (event: any, data: { tabs: Tab[]; groups: TabGroup[]; activeTabId: number | null }) => void) => () => void;
  onTriggerTabSearch: (cb: (event: any) => void) => () => void;
  onShowCrashPrompt: (cb: (event: any) => void) => () => void;
  onSessionsUpdated: (cb: (event: any) => void) => () => void;
  onFocusAddressBar: (cb: (event: any) => void) => () => void;
  onFindOpen: (cb: (event: any) => void) => () => void;
  onFindClose: (cb: (event: any) => void) => () => void;
  onFindResult: (cb: (event: any, data: FindResult) => void) => () => void;
  onBookmarkChanged: (cb: (event: any, data: { url: string; isBookmarked: boolean }) => void) => () => void;
  onBookmarkToggleRequest: (cb: (event: any) => void) => () => void;
  onSaveSessionShortcut: (cb: (event: any) => void) => () => void;
  onSettingsChanged: (cb: (event: any) => void) => () => void;
  onNavigationUpdate: (cb: (event: any, data: any) => void) => () => void;
}

declare global {
  interface Window {
    browserAPI: BrowserAPI;
  }
}
