import { BrowserWindow, WebContentsView, Menu, app, clipboard } from 'electron';
import * as path from 'path';
import { SIDEBAR_WIDTH, TITLE_BAR_HEIGHT, TOOLBAR_HEIGHT } from '../../shared/constants';
import { DatabaseManager } from './DatabaseManager';

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

interface ClosedTabRecord {
  url: string;
  title: string;
  groupId: string | null;
}

const GROUP_COLORS = [
  '#7c65dc', '#1D9E75', '#378ADD', '#EF9F27',
  '#E24B4A', '#D4537E', '#D85A30', '#888780'
];

const ZOOM_LEVELS = [0.25, 0.33, 0.50, 0.67, 0.75, 0.80, 0.90, 1.0, 1.10, 1.25, 1.50, 1.75, 2.0, 2.50, 3.0, 4.0, 5.0];

const INTERNAL_TITLES: Record<string, string> = {
  'browser://settings': 'Settings',
  'browser://bookmarks': 'Bookmarks',
  'browser://history': 'History',
};

export class TabManager {
  private tabs: Tab[] = [];
  private groups: TabGroup[] = [];
  private activeTabId: number | null = null;
  private viewsMap = new Map<number, WebContentsView>();
  private mainWindow: BrowserWindow;
  private nextTabId = 1;
  private nextGroupId = 1;
  private preloadPath: string;
  private newTabUrl: string;
  private db?: DatabaseManager;
  private closedTabStack: ClosedTabRecord[] = [];

  constructor(mainWindow: BrowserWindow, preloadPath: string, newTabUrl: string, db?: DatabaseManager) {
    this.mainWindow = mainWindow;
    this.preloadPath = preloadPath;
    this.newTabUrl = newTabUrl;
    this.db = db;
  }

  public getTabs() { return this.tabs; }
  public getGroups() { return this.groups; }
  public getActiveTabId() { return this.activeTabId; }

  public setTabsAndGroups(tabs: Tab[], groups: TabGroup[]) {
    this.groups = groups || [];
    this.closeAllTabs();

    let lastActiveId: number | null = null;
    let maxTabId = 0;

    for (const savedTab of tabs) {
      if (savedTab.id > maxTabId) maxTabId = savedTab.id;
      this.createTabInternal(savedTab.id, savedTab.url, savedTab.title, savedTab.groupId);
      if (savedTab.isActive) lastActiveId = savedTab.id;
    }

    this.nextTabId = maxTabId + 1;

    let maxGroupId = 0;
    for (const group of this.groups) {
      const n = parseInt(group.id.replace('group-', ''), 10);
      if (!isNaN(n) && n > maxGroupId) maxGroupId = n;
    }
    this.nextGroupId = maxGroupId + 1;

    if (lastActiveId !== null && this.viewsMap.has(lastActiveId)) {
      this.activateTab(lastActiveId);
    } else if (this.tabs.length > 0) {
      this.activateTab(this.tabs[0].id);
    } else {
      this.createTab();
    }
  }

  private closeAllTabs() {
    for (const [id, view] of this.viewsMap.entries()) {
      try {
        this.mainWindow.contentView.removeChildView(view);
        (view.webContents as any).destroy();
      } catch (err) {
        console.error(`Failed to destroy view ${id}:`, err);
      }
    }
    this.viewsMap.clear();
    this.tabs = [];
    this.activeTabId = null;
  }

  private isInternalUrl(url: string): boolean {
    return url.startsWith('browser://');
  }

  public createTab(url?: string, activate = true, groupId: string | null = null): number {
    const resolvedUrl = url ?? this.newTabUrl;
    const id = this.nextTabId++;
    this.createTabInternal(id, resolvedUrl, 'New Tab', groupId);
    if (activate) {
      this.activateTab(id);
    } else {
      this.pushState();
    }
    return id;
  }

  private createTabInternal(id: number, url: string, initialTitle: string, groupId: string | null = null) {
    const isInternal = this.isInternalUrl(url);

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: this.preloadPath
      }
    });

    this.mainWindow.contentView.addChildView(view);
    view.setBounds({ x: 0, y: -10000, width: 0, height: 0 });

    const tabRecord: Tab = {
      id, url,
      title: isInternal ? (INTERNAL_TITLES[url] || url.replace('browser://', '')) : initialTitle,
      favicon: '',
      isActive: false,
      groupId,
      lastActive: Date.now(),
      isLoading: false,
      zoomFactor: 1.0,
      isInternal
    };

    this.tabs.push(tabRecord);
    this.viewsMap.set(id, view);

    if (isInternal) {
      view.webContents.loadURL('about:blank');
    } else {
      view.webContents.loadURL(url);
    }

    // Track loading state
    view.webContents.on('did-start-loading', () => {
      if (!tabRecord.isInternal) tabRecord.isLoading = true;
      this.pushState();
    });

    const onLoadingDone = () => {
      tabRecord.isLoading = false;
      tabRecord.url = view.webContents.getURL();
      tabRecord.title = view.webContents.getTitle() || tabRecord.title;
      this.db?.addHistory(tabRecord.url, tabRecord.title);
      this.pushState();
    };

    view.webContents.on('did-stop-loading', onLoadingDone);
    view.webContents.on('did-navigate', (_, targetUrl) => { tabRecord.url = targetUrl; this.pushState(); });
    view.webContents.on('did-navigate-in-page', (_, targetUrl) => { tabRecord.url = targetUrl; this.pushState(); });
    view.webContents.on('page-title-updated', (_, title) => { tabRecord.title = title || view.webContents.getTitle(); this.pushState(); });
    view.webContents.on('page-favicon-updated', (_, favicons) => {
      if (favicons?.length) { tabRecord.favicon = favicons[0]; this.pushState(); }
    });

    view.webContents.on('found-in-page', (_, result) => {
      if (this.activeTabId === id) {
        this.mainWindow.webContents.send('find:result', {
          activeMatchOrdinal: result.activeMatchOrdinal ?? 0,
          matches: result.matches ?? 0
        });
      }
    });

    // Intercept keyboard shortcuts before web pages see them
    view.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const ctrl = input.control || input.meta;

      if (ctrl && !input.shift && input.key.toLowerCase() === 't') { event.preventDefault(); this.createTab(); }
      else if (ctrl && !input.shift && input.key.toLowerCase() === 'w') { event.preventDefault(); this.closeTab(id); }
      else if (ctrl && input.shift && input.key.toUpperCase() === 'T') { event.preventDefault(); this.reopenLastClosedTab(); }
      else if (ctrl && !input.shift && input.key === 'Tab') { event.preventDefault(); this.activateNextTab(); }
      else if (ctrl && input.shift && input.key === 'Tab') { event.preventDefault(); this.activatePrevTab(); }
      else if (ctrl && input.key.toLowerCase() === 'l') { event.preventDefault(); this.mainWindow.webContents.send('focus-address-bar'); }
      else if (ctrl && input.key.toLowerCase() === 'f') { event.preventDefault(); this.mainWindow.webContents.send('find:open'); }
      else if (ctrl && input.shift && input.key.toUpperCase() === 'R') { event.preventDefault(); this.hardReloadActiveTab(); }
      else if (ctrl && !input.shift && input.key.toLowerCase() === 'r') { event.preventDefault(); this.activeTabReload(); }
      else if (ctrl && (input.key === '=' || input.key === '+')) { event.preventDefault(); this.zoomActiveTab('in'); }
      else if (ctrl && input.key === '-') { event.preventDefault(); this.zoomActiveTab('out'); }
      else if (ctrl && input.key === '0') { event.preventDefault(); this.zoomActiveTab('reset'); }
      else if (ctrl && input.key.toLowerCase() === 'd') { event.preventDefault(); this.mainWindow.webContents.send('bookmark-toggle'); }
      else if (ctrl && input.key === ',') { event.preventDefault(); this.createTab('browser://settings', true); }
      else if (ctrl && input.shift && input.key.toUpperCase() === 'S') { event.preventDefault(); this.mainWindow.webContents.send('sessions:save-shortcut'); }
      else if (ctrl && input.shift && input.key.toUpperCase() === 'A') { event.preventDefault(); this.mainWindow.webContents.send('trigger-tab-search'); }
      else if (input.key === 'F6') { event.preventDefault(); this.mainWindow.webContents.send('focus-address-bar'); }
      else {
        const numKey = parseInt(input.key);
        if (ctrl && !isNaN(numKey) && numKey >= 1 && numKey <= 9) {
          event.preventDefault();
          numKey === 9 ? this.activateTabByIndex(-1) : this.activateTabByIndex(numKey - 1);
        }
      }
    });

    // Open links targeting _blank in a new background tab
    view.webContents.setWindowOpenHandler((details) => {
      this.createTab(details.url, false, tabRecord.groupId);
      return { action: 'deny' };
    });
  }

  public activateTab(id: number) {
    if (this.activeTabId === id) {
      this.viewsMap.get(id)?.webContents.focus();
      return;
    }

    // Hide current
    if (this.activeTabId !== null) {
      this.viewsMap.get(this.activeTabId)?.setBounds({ x: 0, y: -10000, width: 0, height: 0 });
      const prev = this.tabs.find(t => t.id === this.activeTabId);
      if (prev) prev.isActive = false;
    }

    const view = this.viewsMap.get(id);
    const record = this.tabs.find(t => t.id === id);

    if (view && record) {
      this.activeTabId = id;
      record.isActive = true;
      record.lastActive = Date.now();

      if (!record.isInternal) {
        this.updateBounds();
        view.webContents.setZoomFactor(record.zoomFactor);
        view.webContents.focus();
      }

      this.mainWindow.webContents.send('find:close');
    }

    this.pushState();
  }

  public closeTab(id: number) {
    const tabIndex = this.tabs.findIndex(t => t.id === id);
    if (tabIndex === -1) return;

    const closedTab = this.tabs[tabIndex];

    // Push to reopen stack (skip blank/newtab pages)
    if (closedTab.url && !closedTab.url.includes('new-tab.html') && closedTab.url !== 'about:blank') {
      this.closedTabStack.push({ url: closedTab.url, title: closedTab.title, groupId: closedTab.groupId });
      if (this.closedTabStack.length > 20) this.closedTabStack.shift();
    }

    const view = this.viewsMap.get(id);
    if (view) {
      try {
        this.mainWindow.contentView.removeChildView(view);
        (view.webContents as any).destroy();
      } catch (err) {
        console.error(`Error destroying view ${id}:`, err);
      }
      this.viewsMap.delete(id);
    }

    this.tabs.splice(tabIndex, 1);

    if (closedTab.groupId) {
      if (!this.tabs.some(t => t.groupId === closedTab.groupId)) {
        this.groups = this.groups.filter(g => g.id !== closedTab.groupId);
      }
    }

    if (this.activeTabId === id) {
      if (this.tabs.length > 0) {
        this.activateTab(this.tabs[Math.min(tabIndex, this.tabs.length - 1)].id);
      } else {
        this.activeTabId = null;
        this.createTab();
      }
    } else {
      this.pushState();
    }
  }

  public reopenLastClosedTab() {
    const record = this.closedTabStack.pop();
    if (record) this.createTab(record.url, true, record.groupId);
  }

  public activateTabByIndex(index: number) {
    if (this.tabs.length === 0) return;
    const i = index < 0 ? this.tabs.length - 1 : Math.min(index, this.tabs.length - 1);
    this.activateTab(this.tabs[i].id);
  }

  public navigateActiveTab(url: string) {
    if (this.activeTabId === null) return;
    const record = this.tabs.find(t => t.id === this.activeTabId);
    const view = this.viewsMap.get(this.activeTabId);
    if (!record || !view) return;

    if (this.isInternalUrl(url)) {
      record.url = url;
      record.isInternal = true;
      record.title = INTERNAL_TITLES[url] || url.replace('browser://', '');
      record.isLoading = false;
      view.setBounds({ x: 0, y: -10000, width: 0, height: 0 });
      this.pushState();
      return;
    }

    if (record.isInternal) {
      record.isInternal = false;
      this.updateBounds();
    }

    view.webContents.loadURL(url);
  }

  public activeTabBack() {
    if (this.activeTabId === null) return;
    const view = this.viewsMap.get(this.activeTabId);
    if (view?.webContents.canGoBack()) view.webContents.goBack();
  }

  public activeTabForward() {
    if (this.activeTabId === null) return;
    const view = this.viewsMap.get(this.activeTabId);
    if (view?.webContents.canGoForward()) view.webContents.goForward();
  }

  public activeTabReload() {
    if (this.activeTabId === null) return;
    this.viewsMap.get(this.activeTabId)?.webContents.reload();
  }

  public hardReloadActiveTab() {
    if (this.activeTabId === null) return;
    this.viewsMap.get(this.activeTabId)?.webContents.reloadIgnoringCache();
  }

  public zoomActiveTab(direction: 'in' | 'out' | 'reset') {
    if (this.activeTabId === null) return;
    const record = this.tabs.find(t => t.id === this.activeTabId);
    const view = this.viewsMap.get(this.activeTabId);
    if (!record || !view || record.isInternal) return;

    let factor = record.zoomFactor;
    if (direction === 'reset') {
      factor = 1.0;
    } else if (direction === 'in') {
      const next = ZOOM_LEVELS.find(z => z > factor + 0.001);
      if (next !== undefined) factor = next;
    } else {
      const prev = [...ZOOM_LEVELS].reverse().find(z => z < factor - 0.001);
      if (prev !== undefined) factor = prev;
    }

    record.zoomFactor = factor;
    view.webContents.setZoomFactor(factor);
    this.pushState();
  }

  public findInPage(query: string, forward = true) {
    if (this.activeTabId === null) return;
    const view = this.viewsMap.get(this.activeTabId);
    if (!view || this.tabs.find(t => t.id === this.activeTabId)?.isInternal) return;
    if (!query.trim()) {
      view.webContents.stopFindInPage('clearSelection');
      return;
    }
    view.webContents.findInPage(query, { forward, matchCase: false });
  }

  public stopFindInPage() {
    if (this.activeTabId === null) return;
    this.viewsMap.get(this.activeTabId)?.webContents.stopFindInPage('clearSelection');
  }

  public updateBounds() {
    if (this.activeTabId === null) return;
    const record = this.tabs.find(t => t.id === this.activeTabId);
    const view = this.viewsMap.get(this.activeTabId);
    if (!view || !record) return;

    if (record.isInternal) {
      view.setBounds({ x: 0, y: -10000, width: 0, height: 0 });
      return;
    }

    const [width, height] = this.mainWindow.getContentSize();
    const chromeHeight = TITLE_BAR_HEIGHT + TOOLBAR_HEIGHT;
    view.setBounds({
      x: SIDEBAR_WIDTH,
      y: chromeHeight,
      width: Math.max(0, width - SIDEBAR_WIDTH),
      height: Math.max(0, height - chromeHeight),
    });
  }

  // ── Group management ──────────────────────────────────────────

  public groupTabs(tabIds: number[], groupName?: string): string {
    const groupId = `group-${this.nextGroupId++}`;
    const color = GROUP_COLORS[(this.nextGroupId - 2) % GROUP_COLORS.length];
    this.groups.push({ id: groupId, name: groupName || `Group ${this.nextGroupId - 1}`, color, isCollapsed: false });
    for (const tabId of tabIds) {
      const tab = this.tabs.find(t => t.id === tabId);
      if (tab) tab.groupId = groupId;
    }
    this.pushState();
    return groupId;
  }

  public ungroupTab(tabId: number) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;
    const old = tab.groupId;
    tab.groupId = null;
    if (old && !this.tabs.some(t => t.groupId === old)) {
      this.groups = this.groups.filter(g => g.id !== old);
    }
    this.pushState();
  }

  public toggleGroupCollapse(groupId: string) {
    const g = this.groups.find(g => g.id === groupId);
    if (g) { g.isCollapsed = !g.isCollapsed; this.pushState(); }
  }

  public setGroupColor(groupId: string, color: string) {
    const g = this.groups.find(g => g.id === groupId);
    if (g) { g.color = color; this.pushState(); }
  }

  public setGroupName(groupId: string, name: string) {
    const g = this.groups.find(g => g.id === groupId);
    if (g) { g.name = name; this.pushState(); }
  }

  public showTabContextMenu(id: number) {
    const tab = this.tabs.find(t => t.id === id);
    if (!tab) return;

    const template: any[] = [
      { label: 'Close Tab', click: () => this.closeTab(id) },
      { label: 'Close Other Tabs', click: () => {
        this.tabs.map(t => t.id).filter(tid => tid !== id).forEach(tid => this.closeTab(tid));
      }},
      { type: 'separator' }
    ];

    if (tab.groupId) {
      template.push({ label: 'Remove from Group', click: () => this.ungroupTab(id) });
    }

    const groupingSubmenu: any[] = this.groups
      .filter(g => g.id !== tab.groupId)
      .map(g => ({ label: `Move to "${g.name}"`, click: () => {
        const old = tab.groupId;
        tab.groupId = g.id;
        if (old && !this.tabs.some(t => t.groupId === old)) this.groups = this.groups.filter(gr => gr.id !== old);
        this.pushState();
      }}));

    groupingSubmenu.push({ label: 'Add to New Group', click: () => this.groupTabs([id]) });
    template.push({ label: 'Group Tab', submenu: groupingSubmenu }, { type: 'separator' },
      { label: 'Duplicate Tab', click: () => this.createTab(tab.url, true, tab.groupId) },
      { label: 'Copy URL', click: () => clipboard.writeText(tab.url) }
    );

    Menu.buildFromTemplate(template).popup({ window: this.mainWindow });
  }

  public showGroupContextMenu(groupId: string) {
    const group = this.groups.find(g => g.id === groupId);
    if (!group) return;
    const template: any[] = [
      { label: 'Ungroup All Tabs', click: () => {
        this.tabs.filter(t => t.groupId === groupId).forEach(t => { t.groupId = null; });
        this.groups = this.groups.filter(g => g.id !== groupId);
        this.pushState();
      }},
      { label: 'Close Group', click: () => {
        [...this.tabs.filter(t => t.groupId === groupId)].forEach(t => this.closeTab(t.id));
      }},
      { type: 'separator' },
      { label: 'Change Group Color', submenu: GROUP_COLORS.map((color, i) => ({
        label: `Color ${i + 1}`, click: () => this.setGroupColor(groupId, color)
      }))}
    ];
    Menu.buildFromTemplate(template).popup({ window: this.mainWindow });
  }

  public activateNextTab() {
    if (this.tabs.length <= 1 || this.activeTabId === null) return;
    const i = this.tabs.findIndex(t => t.id === this.activeTabId);
    this.activateTab(this.tabs[(i + 1) % this.tabs.length].id);
  }

  public activatePrevTab() {
    if (this.tabs.length <= 1 || this.activeTabId === null) return;
    const i = this.tabs.findIndex(t => t.id === this.activeTabId);
    this.activateTab(this.tabs[(i - 1 + this.tabs.length) % this.tabs.length].id);
  }

  public pushState() {
    this.mainWindow.webContents.send('tab-state-update', {
      tabs: this.tabs.map(t => ({
        id: t.id, url: t.url, title: t.title, favicon: t.favicon,
        isActive: t.isActive, groupId: t.groupId, lastActive: t.lastActive,
        isLoading: t.isLoading, zoomFactor: t.zoomFactor, isInternal: t.isInternal
      })),
      groups: this.groups,
      activeTabId: this.activeTabId
    });
  }
}
