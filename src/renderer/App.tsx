import React, { useEffect, useState, useRef } from 'react';
import { Tab, TabGroup, SessionMetadata } from './types';

function Icon({ glyph, className = '' }: { glyph: string; className?: string }) {
  return <span aria-hidden="true" className={`mdl-icon ${className}`}>{glyph}</span>;
}

const groupColorClass = (color?: string | null) => {
  const normalized = (color || '').toLowerCase();
  const map: Record<string, string> = {
    '#7c65dc': 'group-color-purple',
    '#1d9e75': 'group-color-teal',
    '#378add': 'group-color-blue',
    '#ef9f27': 'group-color-amber',
    '#e24b4a': 'group-color-red',
    '#d4537e': 'group-color-pink',
    '#d85a30': 'group-color-coral',
    '#888780': 'group-color-gray'
  };
  return map[normalized] || 'group-color-gray';
};

export default function App() {
  // Navigation URL & Loading State (for the active tab)
  const [activeUrl, setActiveUrl] = useState('https://example.com');
  const [activeIsLoading, setActiveIsLoading] = useState(false);
  const [inputVal, setInputVal] = useState('https://example.com');
  const [isFocused, setIsFocused] = useState(false);

  // Tabs & Groups State
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [groups, setGroups] = useState<TabGroup[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);

  // Group renaming
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');

  // Tab Search Overlay
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Tab[]>([]);

  // Session Manager States
  const [sessions, setSessions] = useState<SessionMetadata[]>([]);
  const [showCrashPrompt, setShowCrashPrompt] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Request initial tab state once on mount
  useEffect(() => {
    window.browserAPI.requestInitialTabState();
  }, []);

  // Load Tab State Updates & Crash Prompts
  useEffect(() => {
    const unsubscribeTabs = window.browserAPI.onTabStateUpdate((event, data) => {
      setTabs(data.tabs);
      setGroups(data.groups);
      setActiveTabId(data.activeTabId);

      const activeTab = data.tabs.find(t => t.id === data.activeTabId);
      if (activeTab) {
        // Always track actual state so onBlur reset has a fresh value
        setActiveUrl(activeTab.url);
        setActiveIsLoading(activeTab.isLoading);
        // Only overwrite what the user is typing when the bar isn't focused
        if (!isFocused) {
          setInputVal(activeTab.url);
        }
      }
    });

    const unsubscribeCrash = window.browserAPI.onShowCrashPrompt(() => {
      setShowCrashPrompt(true);
    });

    return () => {
      unsubscribeTabs();
      unsubscribeCrash();
    };
  }, [isFocused]);

  // Load Sessions
  const loadSessionsList = async () => {
    const list = await window.browserAPI.listSessions();
    setSessions(list);
  };

  useEffect(() => {
    loadSessionsList();

    const unsubscribeSessions = window.browserAPI.onSessionsUpdated(() => {
      loadSessionsList();
    });

    return unsubscribeSessions;
  }, []);

  // Listen for search triggers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setShowSearch(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const unsubscribeSearchTrigger = window.browserAPI.onTriggerTabSearch(() => {
      setShowSearch(prev => !prev);
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      unsubscribeSearchTrigger();
    };
  }, []);

  // Handle Search Input focus
  useEffect(() => {
    if (showSearch) {
      setSearchQuery('');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [showSearch]);

  // Perform Fuzzy Search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const query = searchQuery.toLowerCase();

    const scored = tabs.map(tab => {
      let score = 0;
      const titleLower = tab.title.toLowerCase();
      const urlLower = tab.url.toLowerCase();

      if (titleLower.includes(query)) {
        // favor titles and earlier matches
        score += 100 - (titleLower.indexOf(query) * 2);
      }
      if (urlLower.includes(query)) {
        score += 50 - (urlLower.indexOf(query) * 2);
      }
      return { tab, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.tab);

    setSearchResults(scored);
  }, [searchQuery, tabs]);

  // Address Input Keyboard Triggers
  const handleAddressKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (inputVal.trim()) {
        window.browserAPI.navigate(inputVal.trim());
        inputRef.current?.blur();
      }
    }
  };

  const handleAddressFocus = () => {
    setIsFocused(true);
    setTimeout(() => {
      inputRef.current?.select();
    }, 50);
  };

  // Group renaming triggers
  const handleGroupDoubleClick = (group: TabGroup) => {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
  };

  const handleGroupRenameSave = (groupId: string) => {
    if (editingGroupName.trim()) {
      window.browserAPI.setGroupName(groupId, editingGroupName.trim());
    }
    setEditingGroupId(null);
  };

  const handleSaveSession = () => {
    const timestamp = new Date().toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
    window.browserAPI.saveSession(`Session ${timestamp}`);
  };

  const handleRestoreCrashSession = () => {
    window.browserAPI.restoreAutoSession();
    setShowCrashPrompt(false);
  };

  const handleDismissCrash = () => {
    window.browserAPI.dismissCrash();
    setShowCrashPrompt(false);
  };

  const getTabGroup = (tab: Tab) => groups.find(g => g.id === tab.groupId);

  const renderFavicon = (tab: Tab) => {
    if (tab.isLoading) {
      return <span className="tab-loading-placeholder" aria-hidden="true" />;
    }

    if (tab.favicon) {
      return (
        <img
          src={tab.favicon}
          className="tab-favicon"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          alt=""
        />
      );
    }

    return <Icon glyph="" className="tab-favicon-fallback" />;
  };

  const renderTabItem = (tab: Tab, nested = false) => {
    const group = getTabGroup(tab);
    const dotClass = groupColorClass(group?.color);

    return (
      <div
        key={`tab-${tab.id}`}
        onClick={() => window.browserAPI.activateTab(tab.id)}
        onContextMenu={() => window.browserAPI.showTabContextMenu(tab.id)}
        className={`sidebar-tab ${nested ? 'nested' : ''} ${tab.isActive ? 'active' : ''}`}
        role="button"
        tabIndex={0}
      >
        <span className={`tab-dot ${dotClass}`} aria-hidden="true" />
        {renderFavicon(tab)}
        <span className="tab-title">{tab.title}</span>
        <button
          className="tab-close-btn"
          aria-label={`Close ${tab.title}`}
          onClick={(e) => {
            e.stopPropagation();
            window.browserAPI.closeTab(tab.id);
          }}
        >
          <Icon glyph="" />
        </button>
      </div>
    );
  };

  // Layout items rendering sequence (interleaves tabs and groupsContiguously)
  const renderedGroupIds = new Set<string>();
  const renderedSidebarItems: React.ReactNode[] = [];

  for (const tab of tabs) {
    if (!tab.groupId) {
      // Ungrouped tab
      renderedSidebarItems.push(renderTabItem(tab));
    } else {
      // Grouped tab
      if (!renderedGroupIds.has(tab.groupId)) {
        renderedGroupIds.add(tab.groupId);
        const group = groups.find(g => g.id === tab.groupId);
        if (group) {
          const groupTabs = tabs.filter(t => t.groupId === group.id);
          renderedSidebarItems.push(
            <div key={`group-${group.id}`} className="group-wrapper">
              <div
                className="group-header"
                onContextMenu={() => window.browserAPI.showGroupContextMenu(group.id)}
                onClick={() => window.browserAPI.toggleGroupCollapse(group.id)}
              >
                <span className={`group-dot ${groupColorClass(group.color)}`} aria-hidden="true" />
                {editingGroupId === group.id ? (
                  <input
                    type="text"
                    className="group-rename-input"
                    value={editingGroupName}
                    onChange={(e) => setEditingGroupName(e.target.value)}
                    onBlur={() => handleGroupRenameSave(group.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleGroupRenameSave(group.id);
                      if (e.key === 'Escape') setEditingGroupId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <div className="group-label">
                    <span
                      className="group-name"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleGroupDoubleClick(group);
                      }}
                    >
                      {group.name}
                    </span>
                    <span className="group-count">({groupTabs.length})</span>
                  </div>
                )}
                <span className="group-collapse-icon">
                  <Icon glyph={group.isCollapsed ? '' : ''} />
                </span>
              </div>
              
              {!group.isCollapsed && (
                <div className="group-tabs">
                  {groupTabs.map(gt => renderTabItem(gt, true))}
                </div>
              )}
            </div>
          );
        }
      }
    }
  }

  return (
    <div className="app-container">
      <header className="title-bar draggable">
        <div className="window-controls nodrag">
          <button 
            onClick={() => window.browserAPI.minimize()}
            aria-label="Minimize"
            title="Minimize"
            className="win-btn minimize"
          >
            <Icon glyph="" />
          </button>
          <button 
            onClick={() => window.browserAPI.maximize()}
            aria-label="Maximize"
            title="Maximize"
            className="win-btn maximize"
          >
            <Icon glyph="" />
          </button>
          <button 
            onClick={() => window.browserAPI.close()}
            aria-label="Close"
            title="Close"
            className="win-btn close"
          >
            <Icon glyph="" />
          </button>
        </div>
      </header>

      <div className="shell-body">
        {/* Sidebar Section */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <span className="sidebar-section-label">Tabs</span>
          
            <button 
              onClick={() => window.browserAPI.createTab()} 
              className="sidebar-newtab-btn nodrag"
              aria-label="Open new tab"
              title="Open new tab (Ctrl+T)"
            >
              <Icon glyph="" />
            </button>
          </div>

          {/* Scrollable Tabs List */}
          <div className="sidebar-tabs-list">
            {renderedSidebarItems}
          </div>

          <div className="sidebar-footer">
            <span className="memory-readout">↓ 312 MB</span>
            <button
              onClick={handleSaveSession}
              className="save-session-text-btn"
              title={sessions.length ? `${sessions.length} saved sessions` : 'Save session'}
            >
              Save session
            </button>
          </div>
        </aside>

        {/* Main View Area */}
        <main className="main-content">
        {/* Crash recovery Banner */}
        {showCrashPrompt && (
          <div className="crash-prompt-banner">
            <div className="crash-prompt-message">
              <Icon glyph="" className="crash-alert-icon" />
              <span>Canto didn't close cleanly. Would you like to restore your last session?</span>
            </div>
            <div className="crash-prompt-actions">
              <button onClick={handleRestoreCrashSession} className="crash-btn restore">
                <Icon glyph="" />
                <span>Restore Session</span>
              </button>
              <button onClick={handleDismissCrash} className="crash-btn dismiss">
                <span>Dismiss</span>
              </button>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <header className="toolbar draggable">
          {/* Navigation Controls */}
          <div className="nav-controls nodrag">
            <button 
              onClick={() => window.browserAPI.back()}
              aria-label="Back"
              title="Back"
              className="control-btn"
            >
              <Icon glyph="" />
            </button>
            <button 
              onClick={() => window.browserAPI.forward()}
              aria-label="Forward"
              title="Forward"
              className="control-btn"
            >
              <Icon glyph="" />
            </button>
            <button 
              onClick={() => window.browserAPI.reload()}
              aria-label={activeIsLoading ? 'Stop loading' : 'Reload'}
              title="Reload"
              className="control-btn"
            >
              <Icon glyph={activeIsLoading ? '' : ''} />
            </button>
          </div>

          {/* Omnibox / Address Bar */}
          <div className="address-bar-container nodrag">
            <span
              className={`security-icon ${activeUrl.startsWith('https://') ? 'secure' : activeUrl.startsWith('http://') ? 'warning' : 'internal'}`}
              role="img"
              aria-label={activeUrl.startsWith('https://') ? 'Secure connection' : activeUrl.startsWith('http://') ? 'Not secure' : 'Internal page'}
            >
              <Icon glyph={activeUrl.startsWith('https://') ? '' : activeUrl.startsWith('http://') ? '' : ''} />
            </span>
            <input
              ref={inputRef}
              type="text"
              className="address-input"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onFocus={handleAddressFocus}
              onBlur={() => {
                setIsFocused(false);
                setInputVal(activeUrl);
              }}
              onKeyDown={handleAddressKeyDown}
              placeholder="Search or enter web address"
            />
            <button className="bookmark-btn" aria-label="Bookmark page" title="Bookmark page">
              <Icon glyph="" />
            </button>
          </div>

          <div className="toolbar-actions nodrag">
            <button 
              onClick={() => setShowSearch(true)} 
              className="control-btn"
              aria-label="Search tabs"
              title="Search tabs (Ctrl+Shift+A)"
            >
              <Icon glyph="" />
            </button>
          </div>
        </header>

        {/* WebContentsView overlays this area */}
        <div className="viewport-placeholder"></div>
        </main>
      </div>

      {/* Fuzzy Tab Search Overlay Modal */}
      {showSearch && (
        <div className="search-overlay" onClick={() => setShowSearch(false)}>
          <div className="search-modal" onClick={(e) => e.stopPropagation()}>
            <div className="search-modal-header">
              <Icon glyph="" className="search-modal-icon" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search tabs by title or URL..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-modal-input"
              />
              <button onClick={() => setShowSearch(false)} className="search-modal-close" aria-label="Close search">
                <Icon glyph="" />
              </button>
            </div>
            <div className="search-modal-results">
              {searchResults.map(tab => (
                <div
                  key={`search-res-${tab.id}`}
                  onClick={() => {
                    window.browserAPI.activateTab(tab.id);
                    setShowSearch(false);
                  }}
                  className="search-result-item"
                >
                  <Icon glyph="" className="result-icon" />
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
                <span className="results-empty">Type to search across {tabs.length} open tabs</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
