import { BrowserWindow, WebContentsView, Menu, app, clipboard } from 'electron';
import * as path from 'path';
import { SIDEBAR_WIDTH, TITLE_BAR_HEIGHT, TOOLBAR_HEIGHT } from '../../shared/constants';

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

const GROUP_COLORS = [
  '#7c65dc',
  '#1D9E75',
  '#378ADD',
  '#EF9F27',
  '#E24B4A',
  '#D4537E',
  '#D85A30',
  '#888780'
];

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

  constructor(mainWindow: BrowserWindow, preloadPath: string, newTabUrl: string) {
    this.mainWindow = mainWindow;
    this.preloadPath = preloadPath;
    this.newTabUrl = newTabUrl;
  }

  public getTabs() {
    return this.tabs;
  }

  public getGroups() {
    return this.groups;
  }

  public getActiveTabId() {
    return this.activeTabId;
  }

  public setTabsAndGroups(tabs: Tab[], groups: TabGroup[]) {
    // Reconstruct groups
    this.groups = groups || [];

    // Reconstruct tabs and views
    this.closeAllTabs();

    let lastActiveId: number | null = null;
    let maxTabId = 0;
    
    for (const savedTab of tabs) {
      if (savedTab.id > maxTabId) {
        maxTabId = savedTab.id;
      }
      this.createTabInternal(savedTab.id, savedTab.url, savedTab.title, savedTab.groupId);
      if (savedTab.isActive) {
        lastActiveId = savedTab.id;
      }
    }
    
    // Update nextTabId to avoid collisions
    this.nextTabId = maxTabId + 1;
    
    // Reconstruct nextGroupId to avoid collisions
    let maxGroupId = 0;
    for (const group of this.groups) {
      const numericId = parseInt(group.id.replace('group-', ''), 10);
      if (!isNaN(numericId) && numericId > maxGroupId) {
        maxGroupId = numericId;
      }
    }
    this.nextGroupId = maxGroupId + 1;

    // Activate the restored active tab or default to first
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

  public createTab(url?: string, activate = true, groupId: string | null = null): number {
    url = url ?? this.newTabUrl;
    const id = this.nextTabId++;
    this.createTabInternal(id, url, 'New Tab', groupId);
    
    if (activate) {
      this.activateTab(id);
    } else {
      this.pushState();
    }
    return id;
  }

  private createTabInternal(id: number, url: string, initialTitle: string, groupId: string | null = null) {
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: this.preloadPath
      }
    });

    this.mainWindow.contentView.addChildView(view);
    
    // Position it offscreen initially
    view.setBounds({ x: 0, y: -10000, width: 0, height: 0 });

    const tabRecord: Tab = {
      id,
      url,
      title: initialTitle,
      favicon: '',
      isActive: false,
      groupId,
      lastActive: Date.now(),
      isLoading: false
    };

    this.tabs.push(tabRecord);
    this.viewsMap.set(id, view);

    // Load target URL
    view.webContents.loadURL(url);

    // Event listeners
    view.webContents.on('did-start-loading', () => {
      tabRecord.isLoading = true;
      this.pushState();
    });

    const onLoadingDone = () => {
      tabRecord.isLoading = false;
      tabRecord.url = view.webContents.getURL();
      tabRecord.title = view.webContents.getTitle() || tabRecord.title;
      this.pushState();
    };

    view.webContents.on('did-stop-loading', onLoadingDone);
    view.webContents.on('did-navigate', (event, targetUrl) => {
      tabRecord.url = targetUrl;
      this.pushState();
    });
    view.webContents.on('did-navigate-in-page', (event, targetUrl) => {
      tabRecord.url = targetUrl;
      this.pushState();
    });

    view.webContents.on('page-title-updated', (event, title) => {
      tabRecord.title = title || view.webContents.getTitle();
      this.pushState();
    });

    view.webContents.on('page-favicon-updated', (event, favicons) => {
      if (favicons && favicons.length > 0) {
        tabRecord.favicon = favicons[0];
        this.pushState();
      }
    });

    // Handle target="_blank" and new window attempts by opening in a background tab
    view.webContents.setWindowOpenHandler((details) => {
      this.createTab(details.url, false, tabRecord.groupId);
      return { action: 'deny' };
    });
  }

  public activateTab(id: number) {
    if (this.activeTabId === id) {
      const view = this.viewsMap.get(id);
      if (view) {
        view.webContents.focus();
      }
      return;
    }

    // Hide current active view
    if (this.activeTabId !== null) {
      const currentActiveView = this.viewsMap.get(this.activeTabId);
      if (currentActiveView) {
        currentActiveView.setBounds({ x: 0, y: -10000, width: 0, height: 0 });
      }
      const activeTabRecord = this.tabs.find(t => t.id === this.activeTabId);
      if (activeTabRecord) {
        activeTabRecord.isActive = false;
      }
    }

    const newActiveView = this.viewsMap.get(id);
    const newActiveRecord = this.tabs.find(t => t.id === id);

    if (newActiveView && newActiveRecord) {
      this.activeTabId = id;
      newActiveRecord.isActive = true;
      newActiveRecord.lastActive = Date.now();
      
      // Update bounds to display in active region
      this.updateBounds();
      newActiveView.webContents.focus();
    }

    this.pushState();
  }

  public closeTab(id: number) {
    const tabIndex = this.tabs.findIndex(t => t.id === id);
    if (tabIndex === -1) return;

    const closedTab = this.tabs[tabIndex];
    const view = this.viewsMap.get(id);

    if (view) {
      try {
        this.mainWindow.contentView.removeChildView(view);
        (view.webContents as any).destroy();
      } catch (err) {
        console.error(`Error deleting view associated with tab ${id}:`, err);
      }
      this.viewsMap.delete(id);
    }

    this.tabs.splice(tabIndex, 1);

    // Clean up empty group if closed tab belonged to one
    if (closedTab.groupId) {
      const groupTabs = this.tabs.filter(t => t.groupId === closedTab.groupId);
      if (groupTabs.length === 0) {
        this.groups = this.groups.filter(g => g.id !== closedTab.groupId);
      }
    }

    // Handle activating another tab if active closed
    if (this.activeTabId === id) {
      if (this.tabs.length > 0) {
        const nextIndex = Math.min(tabIndex, this.tabs.length - 1);
        this.activateTab(this.tabs[nextIndex].id);
      } else {
        this.activeTabId = null;
        this.createTab();
      }
    } else {
      this.pushState();
    }
  }

  public navigateActiveTab(input: string) {
    if (this.activeTabId === null) return;
    const view = this.viewsMap.get(this.activeTabId);
    if (view) {
      view.webContents.loadURL(input);
    }
  }

  public activeTabBack() {
    if (this.activeTabId === null) return;
    const view = this.viewsMap.get(this.activeTabId);
    if (view && view.webContents.canGoBack()) {
      view.webContents.goBack();
    }
  }

  public activeTabForward() {
    if (this.activeTabId === null) return;
    const view = this.viewsMap.get(this.activeTabId);
    if (view && view.webContents.canGoForward()) {
      view.webContents.goForward();
    }
  }

  public activeTabReload() {
    if (this.activeTabId === null) return;
    const view = this.viewsMap.get(this.activeTabId);
    if (view) {
      view.webContents.reload();
    }
  }

  public updateBounds() {
    if (this.activeTabId === null) return;
    const view = this.viewsMap.get(this.activeTabId);
    if (view) {
      const [width, height] = this.mainWindow.getContentSize();
      const chromeHeight = TITLE_BAR_HEIGHT + TOOLBAR_HEIGHT;
      view.setBounds({
        x: SIDEBAR_WIDTH,
        y: chromeHeight,
        width: Math.max(0, width - SIDEBAR_WIDTH),
        height: Math.max(0, height - chromeHeight),
      });
    }
  }

  public groupTabs(tabIds: number[], groupName?: string): string {
    const groupId = `group-${this.nextGroupId++}`;
    const color = GROUP_COLORS[(this.nextGroupId - 2) % GROUP_COLORS.length];
    const name = groupName || `Group ${this.nextGroupId - 1}`;

    const newGroup: TabGroup = {
      id: groupId,
      name,
      color,
      isCollapsed: false
    };

    this.groups.push(newGroup);

    for (const tabId of tabIds) {
      const tab = this.tabs.find(t => t.id === tabId);
      if (tab) {
        tab.groupId = groupId;
      }
    }

    this.pushState();
    return groupId;
  }

  public ungroupTab(tabId: number) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    const oldGroupId = tab.groupId;
    tab.groupId = null;

    // Clean up empty groups
    if (oldGroupId) {
      const groupTabs = this.tabs.filter(t => t.groupId === oldGroupId);
      if (groupTabs.length === 0) {
        this.groups = this.groups.filter(g => g.id !== oldGroupId);
      }
    }

    this.pushState();
  }

  public toggleGroupCollapse(groupId: string) {
    const group = this.groups.find(g => g.id === groupId);
    if (group) {
      group.isCollapsed = !group.isCollapsed;
      this.pushState();
    }
  }

  public setGroupColor(groupId: string, color: string) {
    const group = this.groups.find(g => g.id === groupId);
    if (group) {
      group.color = color;
      this.pushState();
    }
  }

  public setGroupName(groupId: string, name: string) {
    const group = this.groups.find(g => g.id === groupId);
    if (group) {
      group.name = name;
      this.pushState();
    }
  }

  public showTabContextMenu(id: number) {
    const tab = this.tabs.find(t => t.id === id);
    if (!tab) return;

    const template: any[] = [
      {
        label: 'Close Tab',
        click: () => this.closeTab(id)
      },
      {
        label: 'Close Other Tabs',
        click: () => {
          const idsToClose = this.tabs.map(t => t.id).filter(tabId => tabId !== id);
          for (const closeId of idsToClose) {
            this.closeTab(closeId);
          }
        }
      },
      { type: 'separator' }
    ];

    const groupingSubmenu = [];
    if (tab.groupId) {
      template.push({
        label: 'Remove from Group',
        click: () => this.ungroupTab(id)
      });
    }

    const otherGroups = this.groups.filter(g => g.id !== tab.groupId);
    if (otherGroups.length > 0) {
      groupingSubmenu.push(
        ...otherGroups.map(g => ({
          label: `Move to "${g.name}"`,
          click: () => {
            const oldGroupId = tab.groupId;
            tab.groupId = g.id;
            
            if (oldGroupId) {
              const groupTabs = this.tabs.filter(t => t.groupId === oldGroupId);
              if (groupTabs.length === 0) {
                this.groups = this.groups.filter(groupItem => groupItem.id !== oldGroupId);
              }
            }
            this.pushState();
          }
        }))
      );
    }

    groupingSubmenu.push({
      label: 'Add to New Group',
      click: () => this.groupTabs([id])
    });

    template.push({
      label: 'Group Tab',
      submenu: groupingSubmenu
    });

    template.push({ type: 'separator' });

    template.push(
      {
        label: 'Duplicate Tab',
        click: () => this.createTab(tab.url, true, tab.groupId)
      },
      {
        label: 'Copy URL',
        click: () => clipboard.writeText(tab.url)
      }
    );

    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: this.mainWindow });
  }

  public showGroupContextMenu(groupId: string) {
    const group = this.groups.find(g => g.id === groupId);
    if (!group) return;

    const template = [
      {
        label: 'Ungroup All Tabs',
        click: () => {
          const tabsInGroup = this.tabs.filter(t => t.groupId === groupId);
          for (const t of tabsInGroup) {
            t.groupId = null;
          }
          this.groups = this.groups.filter(g => g.id !== groupId);
          this.pushState();
        }
      },
      {
        label: 'Close Group',
        click: () => {
          const tabsInGroup = this.tabs.filter(t => t.groupId === groupId);
          for (const t of tabsInGroup) {
            this.closeTab(t.id);
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Change Group Color',
        submenu: GROUP_COLORS.map((color, index) => ({
          label: `Color ${index + 1}`,
          click: () => this.setGroupColor(groupId, color)
        }))
      }
    ];

    const menu = Menu.buildFromTemplate(template as any);
    menu.popup({ window: this.mainWindow });
  }

  public activateNextTab() {
    if (this.tabs.length <= 1 || this.activeTabId === null) return;
    const activeIndex = this.tabs.findIndex(t => t.id === this.activeTabId);
    const nextIndex = (activeIndex + 1) % this.tabs.length;
    this.activateTab(this.tabs[nextIndex].id);
  }

  public activatePrevTab() {
    if (this.tabs.length <= 1 || this.activeTabId === null) return;
    const activeIndex = this.tabs.findIndex(t => t.id === this.activeTabId);
    const prevIndex = (activeIndex - 1 + this.tabs.length) % this.tabs.length;
    this.activateTab(this.tabs[prevIndex].id);
  }

  public pushState() {
    this.mainWindow.webContents.send('tab-state-update', {
      tabs: this.tabs.map(t => ({
        id: t.id,
        url: t.url,
        title: t.title,
        favicon: t.favicon,
        isActive: t.isActive,
        groupId: t.groupId,
        lastActive: t.lastActive,
        isLoading: t.isLoading
      })),
      groups: this.groups,
      activeTabId: this.activeTabId
    });
  }
}
