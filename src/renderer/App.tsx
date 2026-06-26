import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Tab, TabGroup, SessionMetadata, OmniboxSuggestion, FindResult } from './types';
import Settings from './Settings';

function Icon({ glyph, className = '' }: { glyph: string; className?: string }) {
  return <span aria-hidden="true" className={`mdl-icon ${className}`}>{glyph}</span>;
}

const groupColorClass = (color?: string | null) => {
  const map: Record<string, string> = {
    '#7c65dc': 'group-color-purple', '#1d9e75': 'group-color-teal',
    '#378add': 'group-color-blue',   '#ef9f27': 'group-color-amber',
    '#e24b4a': 'group-color-red',    '#d4537e': 'group-color-pink',
    '#d85a30': 'group-color-coral',  '#888780': 'group-color-gray'
  };
  return map[(color || '').toLowerCase()] || 'group-color-gray';
};

function stripScheme(url: string): string {
  if (!url || url.startsWith('browser://') || url.startsWith('about:') || url.includes('new-tab.html')) return '';
  return url.replace(/^https?:\/\//, '');
}

export default function App() {
  // ── Tab state ────────────────────────────────────────────────
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [groups, setGroups] = useState<TabGroup[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);

  // ── Address bar ──────────────────────────────────────────────
  const [activeUrl, setActiveUrl] = useState('');
  const [activeTitle, setActiveTitle] = useState('');
  const [activeFavicon, setActiveFavicon] = useState('');
  const [activeIsLoading, setActiveIsLoading] = useState(false);
  const [activeZoom, setActiveZoom] = useState(1.0);
  const [activeIsInternal, setActiveIsInternal] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  // ── Omnibox ──────────────────────────────────────────────────
  const [suggestions, setSuggestions] = useState<OmniboxSuggestion[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Bookmark ─────────────────────────────────────────────────
  const [isBookmarked, setIsBookmarked] = useState(false);

  // ── Find bar ─────────────────────────────────────────────────
  const [showFind, setShowFind] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findResult, setFindResult] = useState<FindResult>({ activeMatchOrdinal: 0, matches: 0 });
  const findInputRef = useRef<HTMLInputElement>(null);

  // ── Sessions & crash ─────────────────────────────────────────
  const [sessions, setSessions] = useState<SessionMetadata[]>([]);
  const [showCrashPrompt, setShowCrashPrompt] = useState(false);

  // ── Group renaming ────────────────────────────────────────────
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');

  // ── Tab search overlay ────────────────────────────────────────
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Tab[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Initial load ──────────────────────────────────────────────
  useEffect(() => { window.browserAPI.requestInitialTabState(); }, []);

  // ── Tab state updates ─────────────────────────────────────────
  useEffect(() => {
    const unsub = window.browserAPI.onTabStateUpdate((_, data) => {
      setTabs(data.tabs);
      setGroups(data.groups);
      setActiveTabId(data.activeTabId);

      const active = data.tabs.find((t: Tab) => t.id === data.activeTabId);
      if (active) {
        setActiveUrl(active.url);
        setActiveTitle(active.title);
        setActiveFavicon(active.favicon);
        setActiveIsLoading(active.isLoading);
        setActiveZoom(active.zoomFactor ?? 1.0);
        setActiveIsInternal(active.isInternal ?? false);
        if (!isFocused) setInputVal(stripScheme(active.url));
      }
    });
    return unsub;
  }, [isFocused]);

  // ── Bookmark state ────────────────────────────────────────────
  useEffect(() => {
    if (!activeUrl || activeUrl.startsWith('about:') || activeUrl.includes('new-tab.html') || activeUrl.startsWith('browser://')) {
      setIsBookmarked(false);
      return;
    }
    window.browserAPI.checkBookmark(activeUrl).then(setIsBookmarked);
  }, [activeUrl]);

  useEffect(() => {
    const unsub = window.browserAPI.onBookmarkChanged((_, data) => {
      if (data.url === activeUrl) setIsBookmarked(data.isBookmarked);
    });
    return unsub;
  }, [activeUrl]);

  useEffect(() => {
    const unsub = window.browserAPI.onBookmarkToggleRequest(() => {
      window.browserAPI.toggleBookmark({ url: activeUrl, title: activeTitle, favicon: activeFavicon });
    });
    return unsub;
  }, [activeUrl, activeTitle, activeFavicon]);

  // ── Session list ──────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setSessions(await window.browserAPI.listSessions());
  }, []);

  useEffect(() => {
    loadSessions();
    const unsub = window.browserAPI.onSessionsUpdated(() => loadSessions());
    return unsub;
  }, [loadSessions]);

  useEffect(() => {
    const unsub = window.browserAPI.onSaveSessionShortcut(() => window.browserAPI.saveSessionShortcut());
    return unsub;
  }, []);

  // ── Crash prompt ──────────────────────────────────────────────
  useEffect(() => {
    const unsub = window.browserAPI.onShowCrashPrompt(() => setShowCrashPrompt(true));
    return unsub;
  }, []);

  // ── Tab search overlay ────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setShowSearch(p => !p);
      }
    };
    window.addEventListener('keydown', handleKey);
    const unsub = window.browserAPI.onTriggerTabSearch(() => setShowSearch(p => !p));
    return () => { window.removeEventListener('keydown', handleKey); unsub(); };
  }, []);

  useEffect(() => {
    if (showSearch) {
      setSearchQuery('');
      setTimeout(() => searchInputRef.current?.focus(), 80);
    }
  }, [showSearch]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const q = searchQuery.toLowerCase();
    setSearchResults(
      tabs.map(t => {
        let s = 0;
        if (t.title.toLowerCase().includes(q)) s += 100 - t.title.toLowerCase().indexOf(q) * 2;
        if (t.url.toLowerCase().includes(q)) s += 50 - t.url.toLowerCase().indexOf(q) * 2;
        return { tab: t, s };
      }).filter(x => x.s > 0).sort((a, b) => b.s - a.s).map(x => x.tab)
    );
  }, [searchQuery, tabs]);

  // ── Focus address bar from main ───────────────────────────────
  useEffect(() => {
    const unsub = window.browserAPI.onFocusAddressBar(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return unsub;
  }, []);

  // ── Find bar ──────────────────────────────────────────────────
  useEffect(() => {
    const unsubOpen = window.browserAPI.onFindOpen(() => {
      setShowFind(true);
      setTimeout(() => findInputRef.current?.focus(), 60);
    });
    const unsubClose = window.browserAPI.onFindClose(() => {
      setShowFind(false);
      setFindQuery('');
      setFindResult({ activeMatchOrdinal: 0, matches: 0 });
    });
    const unsubResult = window.browserAPI.onFindResult((_, data) => setFindResult(data));
    return () => { unsubOpen(); unsubClose(); unsubResult(); };
  }, []);

  const closeFindBar = () => {
    window.browserAPI.findStop();
    setShowFind(false);
    setFindQuery('');
    setFindResult({ activeMatchOrdinal: 0, matches: 0 });
  };

  // ── Omnibox suggestions ───────────────────────────────────────
  useEffect(() => {
    if (!isFocused || !inputVal.trim()) { setSuggestions([]); setSelectedIdx(-1); return; }
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    suggestTimer.current = setTimeout(async () => {
      const results = await window.browserAPI.queryOmnibox(inputVal);
      setSuggestions(results);
      setSelectedIdx(-1);
    }, 150);
    return () => { if (suggestTimer.current) clearTimeout(suggestTimer.current); };
  }, [inputVal, isFocused]);

  // ── Address bar handlers ──────────────────────────────────────
  const commitNavigation = (value: string) => {
    if (value.trim()) window.browserAPI.navigate(value.trim());
    setSuggestions([]);
    setSelectedIdx(-1);
    inputRef.current?.blur();
  };

  const handleAddressKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setSuggestions([]);
      setSelectedIdx(-1);
      setInputVal(stripScheme(activeUrl));
      inputRef.current?.blur();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, suggestions.length - 1));
      if (selectedIdx + 1 < suggestions.length) setInputVal(suggestions[selectedIdx + 1].url);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => {
        const next = Math.max(i - 1, -1);
        setInputVal(next < 0 ? inputVal : suggestions[next].url);
        return next;
      });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = selectedIdx >= 0 ? suggestions[selectedIdx].url : inputVal;
      commitNavigation(target);
    }
  };

  const handleAddressFocus = () => {
    setIsFocused(true);
    setInputVal(activeUrl);
    setTimeout(() => inputRef.current?.select(), 40);
  };

  const handleAddressBlur = () => {
    setIsFocused(false);
    setSuggestions([]);
    setSelectedIdx(-1);
    setInputVal(stripScheme(activeUrl));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').trim();
    if (/^https?:\/\//.test(text)) {
      e.preventDefault();
      setInputVal(text);
      window.browserAPI.navigate(text);
      inputRef.current?.blur();
    }
  };

  // ── Session helpers ───────────────────────────────────────────
  const handleSaveSession = () => {
    const ts = new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    window.browserAPI.saveSession(`Session ${ts}`);
  };

  // ── Render helpers ────────────────────────────────────────────
  const getTabGroup = (tab: Tab) => groups.find(g => g.id === tab.groupId);

  const renderFavicon = (tab: Tab) => {
    if (tab.isLoading) return <span className="tab-loading-placeholder" aria-hidden="true" />;
    if (tab.favicon) return (
      <img src={tab.favicon} className="tab-favicon"
        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} alt="" />
    );
    return <Icon glyph="" className="tab-favicon-fallback" />;
  };

  const renderTabItem = (tab: Tab, nested = false) => {
    const group = getTabGroup(tab);
    return (
      <div
        key={`tab-${tab.id}`}
        onClick={() => window.browserAPI.activateTab(tab.id)}
        onContextMenu={() => window.browserAPI.showTabContextMenu(tab.id)}
        className={`sidebar-tab${nested ? ' nested' : ''}${tab.isActive ? ' active' : ''}`}
        role="button" tabIndex={0}
      >
        <span className={`tab-dot ${groupColorClass(group?.color)}`} aria-hidden="true" />
        {renderFavicon(tab)}
        <span className="tab-title">{tab.title || 'New Tab'}</span>
        <button className="tab-close-btn" aria-label={`Close ${tab.title}`}
          onClick={e => { e.stopPropagation(); window.browserAPI.closeTab(tab.id); }}>
          <Icon glyph="" />
        </button>
      </div>
    );
  };

  // Build sidebar items
  const renderedGroupIds = new Set<string>();
  const sidebarItems: React.ReactNode[] = [];
  for (const tab of tabs) {
    if (!tab.groupId) {
      sidebarItems.push(renderTabItem(tab));
    } else if (!renderedGroupIds.has(tab.groupId)) {
      renderedGroupIds.add(tab.groupId);
      const group = groups.find(g => g.id === tab.groupId);
      if (group) {
        const groupTabs = tabs.filter(t => t.groupId === group.id);
        sidebarItems.push(
          <div key={`group-${group.id}`} className="group-wrapper">
            <div className="group-header"
              onContextMenu={() => window.browserAPI.showGroupContextMenu(group.id)}
              onClick={() => window.browserAPI.toggleGroupCollapse(group.id)}>
              <span className={`group-dot ${groupColorClass(group.color)}`} aria-hidden="true" />
              {editingGroupId === group.id ? (
                <input type="text" className="group-rename-input" value={editingGroupName}
                  onChange={e => setEditingGroupName(e.target.value)}
                  onBlur={() => { if (editingGroupName.trim()) window.browserAPI.setGroupName(group.id, editingGroupName.trim()); setEditingGroupId(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') { if (editingGroupName.trim()) window.browserAPI.setGroupName(group.id, editingGroupName.trim()); setEditingGroupId(null); } if (e.key === 'Escape') setEditingGroupId(null); }}
                  onClick={e => e.stopPropagation()} autoFocus />
              ) : (
                <div className="group-label">
                  <span className="group-name"
                    onDoubleClick={e => { e.stopPropagation(); setEditingGroupId(group.id); setEditingGroupName(group.name); }}>
                    {group.name}
                  </span>
                  <span className="group-count">({groupTabs.length})</span>
                </div>
              )}
              <span className="group-collapse-icon">
                <Icon glyph={group.isCollapsed ? '' : ''} />
              </span>
            </div>
            {!group.isCollapsed && (
              <div className="group-tabs">{groupTabs.map(gt => renderTabItem(gt, true))}</div>
            )}
          </div>
        );
      }
    }
  }

  // Security icon
  const securityClass = activeUrl.startsWith('https://') ? 'secure' : activeUrl.startsWith('http://') ? 'warning' : 'internal';
  const securityGlyph = activeUrl.startsWith('https://') ? '' : activeUrl.startsWith('http://') ? '' : '';

  // Zoom display
  const zoomPct = Math.round(activeZoom * 100);
  const showZoom = zoomPct !== 100;

  // Determine the active internal route
  const internalRoute = activeIsInternal && activeUrl.startsWith('browser://') ? activeUrl.replace('browser://', '') : null;

  return (
    <div className="app-container">
      {/* Title bar */}
      <header className="title-bar draggable">
        <div className="window-controls nodrag">
          <button onClick={() => window.browserAPI.minimize()} aria-label="Minimize" className="win-btn minimize"><Icon glyph="" /></button>
          <button onClick={() => window.browserAPI.maximize()} aria-label="Maximize" className="win-btn maximize"><Icon glyph="" /></button>
          <button onClick={() => window.browserAPI.close()} aria-label="Close" className="win-btn close"><Icon glyph="" /></button>
        </div>
      </header>

      <div className="shell-body">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <span className="sidebar-section-label">Tabs</span>
            <button onClick={() => window.browserAPI.createTab()} className="sidebar-newtab-btn nodrag"
              aria-label="New tab" title="New tab (Ctrl+T)">
              <Icon glyph="" />
            </button>
          </div>
          <div className="sidebar-tabs-list">{sidebarItems}</div>
          <div className="sidebar-footer">
            <span className="memory-readout">↓ 312 MB</span>
            <button onClick={handleSaveSession} className="save-session-text-btn"
              title={sessions.length ? `${sessions.length} saved sessions` : 'Save session (Ctrl+Shift+S)'}>
              Save session
            </button>
          </div>
        </aside>

        {/* Main area */}
        <main className="main-content">
          {/* Crash banner */}
          {showCrashPrompt && (
            <div className="crash-prompt-banner">
              <div className="crash-prompt-message">
                <Icon glyph="" className="crash-alert-icon" />
                <span>Canto didn't close cleanly. Restore your last session?</span>
              </div>
              <div className="crash-prompt-actions">
                <button onClick={() => { window.browserAPI.restoreAutoSession(); setShowCrashPrompt(false); }} className="crash-btn restore">
                  <Icon glyph="" /><span>Restore</span>
                </button>
                <button onClick={() => { window.browserAPI.dismissCrash(); setShowCrashPrompt(false); }} className="crash-btn dismiss">
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Toolbar */}
          <header className="toolbar draggable">
            <div className="nav-controls nodrag">
              <button onClick={() => window.browserAPI.back()} aria-label="Back" className="control-btn"><Icon glyph="" /></button>
              <button onClick={() => window.browserAPI.forward()} aria-label="Forward" className="control-btn"><Icon glyph="" /></button>
              <button onClick={() => window.browserAPI.reload()} aria-label={activeIsLoading ? 'Stop' : 'Reload'} className="control-btn">
                <Icon glyph={activeIsLoading ? '' : ''} />
              </button>
            </div>

            {/* Omnibox */}
            <div className="address-bar-container nodrag">
              <span className={`security-icon ${securityClass}`} role="img"
                aria-label={securityClass === 'secure' ? 'Secure' : securityClass === 'warning' ? 'Not secure' : 'Internal'}>
                <Icon glyph={securityGlyph} />
              </span>
              <input
                ref={inputRef}
                type="text"
                className="address-input"
                value={isFocused ? inputVal : (stripScheme(activeUrl) || '')}
                onChange={e => setInputVal(e.target.value)}
                onFocus={handleAddressFocus}
                onBlur={handleAddressBlur}
                onKeyDown={handleAddressKeyDown}
                onPaste={handlePaste}
                placeholder="Search or enter web address"
              />
              {showZoom && !isFocused && (
                <button
                  className="zoom-indicator nodrag"
                  onClick={() => window.browserAPI.zoomChange('reset')}
                  title="Reset zoom (Ctrl+0)"
                >
                  {zoomPct}%
                </button>
              )}
              <button
                className={`bookmark-btn nodrag${isBookmarked ? ' bookmarked' : ''}`}
                aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark page'}
                title="Bookmark (Ctrl+D)"
                onClick={() => window.browserAPI.toggleBookmark({ url: activeUrl, title: activeTitle, favicon: activeFavicon })}
              >
                <Icon glyph={isBookmarked ? '' : ''} />
              </button>

              {/* Omnibox dropdown */}
              {isFocused && suggestions.length > 0 && (
                <div className="omnibox-dropdown">
                  {suggestions.map((s, i) => (
                    <div
                      key={s.url}
                      className={`omnibox-item${i === selectedIdx ? ' selected' : ''}`}
                      onMouseDown={e => { e.preventDefault(); commitNavigation(s.url); }}
                      onMouseEnter={() => setSelectedIdx(i)}
                    >
                      <span className="omnibox-item-icon">
                        <Icon glyph={s.type === 'bookmark' ? '' : ''} />
                      </span>
                      <span className="omnibox-item-body">
                        <span className="omnibox-item-title">{s.title || s.url}</span>
                        <span className="omnibox-item-url">{s.url}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="toolbar-actions nodrag">
              <button onClick={() => setShowSearch(true)} className="control-btn"
                aria-label="Search tabs" title="Search tabs (Ctrl+Shift+A)">
                <Icon glyph="" />
              </button>
            </div>
          </header>

          {/* Viewport / internal page */}
          {internalRoute === 'settings' ? (
            <div className="internal-page-view"><Settings /></div>
          ) : (
            <div className="viewport-placeholder" />
          )}

          {/* Find bar */}
          {showFind && (
            <div className="find-bar">
              <Icon glyph="" className="find-bar-icon" />
              <input
                ref={findInputRef}
                type="text"
                className="find-bar-input"
                placeholder="Find in page…"
                value={findQuery}
                onChange={e => {
                  setFindQuery(e.target.value);
                  window.browserAPI.findStart(e.target.value, true);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') window.browserAPI.findStart(findQuery, !e.shiftKey);
                  if (e.key === 'Escape') closeFindBar();
                }}
              />
              {findQuery && (
                <span className="find-bar-count">
                  {findResult.matches === 0 ? 'No results' : `${findResult.activeMatchOrdinal} of ${findResult.matches}`}
                </span>
              )}
              <button className="find-bar-btn" aria-label="Previous" title="Previous (Shift+Enter)"
                onClick={() => window.browserAPI.findStart(findQuery, false)}>
                <Icon glyph="" />
              </button>
              <button className="find-bar-btn" aria-label="Next" title="Next (Enter)"
                onClick={() => window.browserAPI.findStart(findQuery, true)}>
                <Icon glyph="" />
              </button>
              <button className="find-bar-btn find-bar-close" aria-label="Close find bar"
                onClick={closeFindBar}>
                <Icon glyph="" />
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Tab search overlay */}
      {showSearch && (
        <div className="search-overlay" onClick={() => setShowSearch(false)}>
          <div className="search-modal" onClick={e => e.stopPropagation()}>
            <div className="search-modal-header">
              <Icon glyph="" className="search-modal-icon" />
              <input ref={searchInputRef} type="text" placeholder="Search tabs by title or URL…"
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="search-modal-input" />
              <button onClick={() => setShowSearch(false)} className="search-modal-close" aria-label="Close search">
                <Icon glyph="" />
              </button>
            </div>
            <div className="search-modal-results">
              {searchResults.map(tab => (
                <div key={`sr-${tab.id}`}
                  onClick={() => { window.browserAPI.activateTab(tab.id); setShowSearch(false); }}
                  className="search-result-item">
                  <Icon glyph="" className="result-icon" />
                  <div className="result-details">
                    <span className="result-title">{tab.title}</span>
                    <span className="result-url">{tab.url}</span>
                  </div>
                </div>
              ))}
              {searchQuery.trim() && searchResults.length === 0 && (
                <span className="results-empty">No matching tabs found</span>
              )}
              {!searchQuery.trim() && (
                <span className="results-empty">Type to search across {tabs.length} open tab{tabs.length !== 1 ? 's' : ''}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
