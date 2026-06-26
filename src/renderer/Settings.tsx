import React, { useEffect, useState } from 'react';
import { AppSettings } from './types';

interface SettingsData {
  settings: AppSettings;
  searchEngines: Array<{ key: string; name: string }>;
}

const SHORTCUT_LABELS: Record<string, string> = {
  newTab: 'New Tab',
  closeTab: 'Close Tab',
  reopenTab: 'Reopen Closed Tab',
  nextTab: 'Next Tab',
  prevTab: 'Previous Tab',
  focusAddress: 'Focus Address Bar',
  tabSearch: 'Search Tabs',
  saveSession: 'Save Session',
  reload: 'Reload',
  hardReload: 'Hard Reload',
  zoomIn: 'Zoom In',
  zoomOut: 'Zoom Out',
  zoomReset: 'Reset Zoom',
  findInPage: 'Find in Page',
  openSettings: 'Open Settings',
  bookmarkPage: 'Bookmark Page',
  tab1: 'Switch to Tab 1',
  tab2: 'Switch to Tab 2',
  tab3: 'Switch to Tab 3',
  tab4: 'Switch to Tab 4',
  tab5: 'Switch to Tab 5',
  tab6: 'Switch to Tab 6',
  tab7: 'Switch to Tab 7',
  tab8: 'Switch to Tab 8',
  lastTab: 'Switch to Last Tab',
};

export default function Settings() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.browserAPI.getAllSettings().then(setData);
    const unsub = window.browserAPI.onSettingsChanged(() => {
      window.browserAPI.getAllSettings().then(setData);
    });
    return unsub;
  }, []);

  const set = (key: string, value: any) => {
    window.browserAPI.setSetting(key, value);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  if (!data) {
    return <div className="settings-loading">Loading settings…</div>;
  }

  const { settings, searchEngines } = data;

  return (
    <div className="settings-page">
      <div className="settings-content">
        <div className="settings-header">
          <h1 className="settings-title">Settings</h1>
          {saved && <span className="settings-saved-badge">Saved</span>}
        </div>

        {/* Search Engine */}
        <section className="settings-section">
          <h2 className="settings-section-title">Search Engine</h2>
          <p className="settings-section-desc">Used for address bar searches and search suggestions.</p>
          <div className="settings-row">
            <label className="settings-label" htmlFor="search-engine">Default search engine</label>
            <select
              id="search-engine"
              className="settings-select"
              value={settings.searchEngine}
              onChange={e => set('searchEngine', e.target.value)}
            >
              {searchEngines.map(se => (
                <option key={se.key} value={se.key}>{se.name}</option>
              ))}
            </select>
          </div>
          <div className="settings-row settings-row-toggle">
            <div>
              <span className="settings-label">Search suggestions</span>
              <span className="settings-hint">Sends typed text to the search engine for suggestions</span>
            </div>
            <button
              className={`settings-toggle ${settings.searchSuggestionsEnabled ? 'on' : ''}`}
              onClick={() => set('searchSuggestionsEnabled', !settings.searchSuggestionsEnabled)}
              aria-pressed={settings.searchSuggestionsEnabled}
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </section>

        {/* Homepage */}
        <section className="settings-section">
          <h2 className="settings-section-title">New Tab</h2>
          <div className="settings-row">
            <label className="settings-label">New tab page</label>
            <div className="settings-radio-group">
              {(['newtab', 'blank', 'custom'] as const).map(opt => (
                <label key={opt} className="settings-radio-label">
                  <input
                    type="radio"
                    name="homepage"
                    value={opt}
                    checked={settings.homepage === opt}
                    onChange={() => set('homepage', opt)}
                    className="settings-radio"
                  />
                  {opt === 'newtab' ? 'Canto new tab' : opt === 'blank' ? 'Blank page' : 'Custom URL'}
                </label>
              ))}
            </div>
          </div>
          {settings.homepage === 'custom' && (
            <div className="settings-row">
              <label className="settings-label" htmlFor="homepage-url">Custom URL</label>
              <input
                id="homepage-url"
                className="settings-input"
                type="text"
                placeholder="https://example.com"
                defaultValue={settings.homepageUrl}
                onBlur={e => set('homepageUrl', e.target.value.trim())}
              />
            </div>
          )}
        </section>

        {/* Zoom */}
        <section className="settings-section">
          <h2 className="settings-section-title">Display</h2>
          <div className="settings-row">
            <label className="settings-label" htmlFor="default-zoom">Default zoom</label>
            <select
              id="default-zoom"
              className="settings-select"
              value={settings.defaultZoom}
              onChange={e => set('defaultZoom', parseFloat(e.target.value))}
            >
              {[0.25,0.33,0.50,0.67,0.75,0.80,0.90,1.0,1.10,1.25,1.50,1.75,2.0].map(z => (
                <option key={z} value={z}>{Math.round(z * 100)}%</option>
              ))}
            </select>
          </div>
        </section>

        {/* Privacy & blocking */}
        <section className="settings-section">
          <h2 className="settings-section-title">Privacy</h2>
          <div className="settings-row settings-row-toggle">
            <div>
              <span className="settings-label">Ad blocker</span>
              <span className="settings-hint">Blocks ads and trackers (requires restart for full effect)</span>
            </div>
            <button
              className={`settings-toggle ${settings.adBlockerEnabled ? 'on' : ''}`}
              onClick={() => set('adBlockerEnabled', !settings.adBlockerEnabled)}
              aria-pressed={settings.adBlockerEnabled}
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
          <div className="settings-row settings-row-toggle">
            <div>
              <span className="settings-label">Auto reading mode</span>
              <span className="settings-hint">Activates reading mode automatically on article pages</span>
            </div>
            <button
              className={`settings-toggle ${settings.readingModeAuto ? 'on' : ''}`}
              onClick={() => set('readingModeAuto', !settings.readingModeAuto)}
              aria-pressed={settings.readingModeAuto}
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </section>

        {/* Keyboard shortcuts */}
        <section className="settings-section">
          <h2 className="settings-section-title">Keyboard Shortcuts</h2>
          <p className="settings-section-desc">Default shortcuts. Remapping coming in a future update.</p>
          <div className="settings-shortcuts-grid">
            {Object.entries(settings.shortcuts).map(([action, combo]) => (
              <div key={action} className="settings-shortcut-row">
                <span className="settings-shortcut-label">{SHORTCUT_LABELS[action] ?? action}</span>
                <kbd className="settings-shortcut-key">{combo}</kbd>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
