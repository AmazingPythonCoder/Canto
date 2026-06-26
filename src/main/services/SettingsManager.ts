import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export const SEARCH_ENGINES: Record<string, { name: string; searchUrl: string; suggestUrl?: string }> = {
  google: {
    name: 'Google',
    searchUrl: 'https://www.google.com/search?q={query}',
    suggestUrl: 'https://suggestqueries.google.com/complete/search?q={query}&client=firefox'
  },
  duckduckgo: {
    name: 'DuckDuckGo',
    searchUrl: 'https://duckduckgo.com/?q={query}',
    suggestUrl: 'https://ac.duckduckgo.com/ac/?q={query}&type=list'
  },
  brave: {
    name: 'Brave Search',
    searchUrl: 'https://search.brave.com/search?q={query}'
  },
  bing: {
    name: 'Bing',
    searchUrl: 'https://www.bing.com/search?q={query}'
  }
};

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

export const DEFAULT_SETTINGS: AppSettings = {
  searchEngine: 'google',
  homepage: 'newtab',
  homepageUrl: '',
  defaultZoom: 1.0,
  adBlockerEnabled: true,
  readingModeAuto: false,
  searchSuggestionsEnabled: false,
  shortcuts: {
    newTab: 'Ctrl+T',
    closeTab: 'Ctrl+W',
    reopenTab: 'Ctrl+Shift+T',
    nextTab: 'Ctrl+Tab',
    prevTab: 'Ctrl+Shift+Tab',
    focusAddress: 'Ctrl+L',
    tabSearch: 'Ctrl+Shift+A',
    saveSession: 'Ctrl+Shift+S',
    reload: 'Ctrl+R',
    hardReload: 'Ctrl+Shift+R',
    zoomIn: 'Ctrl+=',
    zoomOut: 'Ctrl+-',
    zoomReset: 'Ctrl+0',
    findInPage: 'Ctrl+F',
    openSettings: 'Ctrl+,',
    bookmarkPage: 'Ctrl+D',
    tab1: 'Ctrl+1',
    tab2: 'Ctrl+2',
    tab3: 'Ctrl+3',
    tab4: 'Ctrl+4',
    tab5: 'Ctrl+5',
    tab6: 'Ctrl+6',
    tab7: 'Ctrl+7',
    tab8: 'Ctrl+8',
    lastTab: 'Ctrl+9'
  }
};

export class SettingsManager {
  private settingsPath: string;
  private settings: AppSettings;

  constructor() {
    this.settingsPath = path.join(app.getPath('userData'), 'settings.json');
    this.settings = this.load();
  }

  private load(): AppSettings {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const raw = fs.readFileSync(this.settingsPath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...(parsed.shortcuts || {}) }
        };
      }
    } catch {}
    return { ...DEFAULT_SETTINGS, shortcuts: { ...DEFAULT_SETTINGS.shortcuts } };
  }

  private save() {
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Settings] Failed to save:', err);
    }
  }

  public getAll(): AppSettings {
    return { ...this.settings, shortcuts: { ...this.settings.shortcuts } };
  }

  public get<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.settings[key];
  }

  public set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    this.settings[key] = value;
    this.save();
  }

  public buildSearchUrl(query: string): string {
    const engine = SEARCH_ENGINES[this.settings.searchEngine] ?? SEARCH_ENGINES.google;
    return engine.searchUrl.replace('{query}', encodeURIComponent(query));
  }
}
