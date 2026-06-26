export interface Tab {
  id: number;
  url: string;
  title: string;
  favicon: string;
  isActive: boolean;
  groupId: string | null;
  lastActive: number;
  isLoading: boolean;
}

export interface TabGroup {
  id: string;
  name: string;
  color: string;
  isCollapsed: boolean;
}

export interface NavigationData {
  url: string;
  title: string;
  isLoading: boolean;
}

export interface SessionMetadata {
  name: string;
  tabCount: number;
  saveDate: number;
}

export interface BrowserAPI {
  // Window controls
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  
  // Navigation
  navigate: (input: string) => void;
  back: () => void;
  forward: () => void;
  reload: () => void;

  // Tabs
  createTab: (url?: string, activate?: boolean) => void;
  activateTab: (id: number) => void;
  closeTab: (id: number) => void;
  showTabContextMenu: (id: number) => void;
  requestInitialTabState: () => void;

  // Groups
  showGroupContextMenu: (groupId: string) => void;
  toggleGroupCollapse: (groupId: string) => void;
  setGroupName: (groupId: string, name: string) => void;
  setGroupColor: (groupId: string, color: string) => void;

  // Sessions
  listSessions: () => Promise<SessionMetadata[]>;
  saveSession: (name: string) => void;
  deleteSession: (name: string) => void;
  loadSession: (name: string) => void;
  restoreAutoSession: () => void;
  dismissCrash: () => void;

  // Listeners
  onNavigationUpdate: (callback: (event: any, data: NavigationData) => void) => () => void;
  onTabStateUpdate: (callback: (event: any, data: { tabs: Tab[]; groups: TabGroup[]; activeTabId: number | null }) => void) => () => void;
  onTriggerTabSearch: (callback: (event: any) => void) => () => void;
  onShowCrashPrompt: (callback: (event: any) => void) => () => void;
  onSessionsUpdated: (callback: (event: any) => void) => () => void;
}

declare global {
  interface Window {
    browserAPI: BrowserAPI;
  }
}
