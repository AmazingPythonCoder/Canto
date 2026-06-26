# Canto

A personal desktop browser built with Electron, React, and TypeScript. Canto wraps Chromium with a custom UI shell focused on tab organization, named sessions, and crash recovery — without the bloat of a full browser distribution.

## Features

- **Tab groups** — color-coded, collapsible groups with custom names
- **Named sessions** — save and restore complete sets of tabs and groups
- **Crash recovery** — detects unclean shutdowns and offers to restore the last auto-saved session
- **Custom chrome** — frameless window with a built-in toolbar, address bar, and tab strip
- **Smart address bar** — auto-detects URLs vs. search queries and falls back to Google Search
- **Keyboard shortcuts** — `Ctrl+T` new tab, `Ctrl+W` close, `Ctrl+Tab` / `Ctrl+Shift+Tab` cycle tabs, `Ctrl+Shift+A` tab search

## Tech Stack

| Layer | Tools |
|---|---|
| Shell | Electron 31 |
| Renderer | React 18, TypeScript, Vite |
| Styling | Plain CSS (dark theme) |
| Storage | `better-sqlite3` (planned), JSON session files (current) |
| Packaging | electron-builder (Windows NSIS) |

## Getting Started

**Prerequisites:** Node.js 18+, npm

```bash
git clone https://github.com/AmazingPythonCoder/Canto.git
cd Canto
npm install
npm run dev
```

Three processes start concurrently: the Vite dev server (renderer), the TypeScript compiler watching `src/main`, and Electron itself. The app loads once `localhost:5173` is ready.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start all three dev processes concurrently |
| `npm run build` | Compile renderer (Vite) + main process (tsc) |
| `npm run package` | Full build + package into a Windows installer (`release/`) |

## Project Structure

```
src/
  main/
    main.ts               # Electron entry — IPC handlers, window setup
    services/
      TabManager.ts       # WebContentsView-based tab engine
      SessionManager.ts   # Save/load/auto-save sessions, crash detection
  preload/
    preload.ts            # Context bridge — exposes IPC to renderer
  renderer/
    App.tsx               # React UI shell (toolbar, tab strip, sidebar)
    index.css             # Global dark-theme styles
  shared/
    constants.ts          # Layout constants shared between main and renderer
```

## Roadmap

- AI sidebar
- Built-in ad blocker
- Password vault
- SQLite-backed history and bookmarks
- Split-screen view
