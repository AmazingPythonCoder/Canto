import { app } from 'electron';
import * as path from 'path';

export interface HistoryEntry {
  url: string;
  title: string;
  visit_count: number;
  last_visited: number;
}

export interface Bookmark {
  url: string;
  title: string;
  favicon: string;
  created_at: number;
}

export class DatabaseManager {
  private db: any = null;

  constructor() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Database = require('better-sqlite3');
      const dbPath = path.join(app.getPath('userData'), 'canto.db');
      this.db = new Database(dbPath);
      this.init();
    } catch (err) {
      console.error('[DB] Failed to initialize better-sqlite3:', err);
    }
  }

  private init() {
    if (!this.db) return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL UNIQUE,
        title TEXT DEFAULT '',
        visit_count INTEGER DEFAULT 1,
        last_visited INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_history_last_visited ON history(last_visited DESC);

      CREATE TABLE IF NOT EXISTS bookmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL UNIQUE,
        title TEXT DEFAULT '',
        favicon TEXT DEFAULT '',
        created_at INTEGER NOT NULL
      );
    `);
  }

  public addHistory(url: string, title: string) {
    if (!this.db) return;
    if (!url || url.startsWith('about:') || url.startsWith('file://') || url.startsWith('browser://') || url.includes('new-tab.html')) return;
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO history (url, title, visit_count, last_visited)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(url) DO UPDATE SET
        title = excluded.title,
        visit_count = visit_count + 1,
        last_visited = excluded.last_visited
    `).run(url, title || url, now);
  }

  public queryHistory(query: string, limit = 8): HistoryEntry[] {
    if (!this.db || !query.trim()) return [];
    const pattern = `%${query}%`;
    const now = Date.now();
    return this.db.prepare(`
      SELECT url, title, visit_count, last_visited
      FROM history
      WHERE url LIKE ? OR title LIKE ?
      ORDER BY (visit_count * 1.0 / (MAX(1, (? - last_visited) / 86400000.0 + 1))) DESC
      LIMIT ?
    `).all(pattern, pattern, now, limit) as HistoryEntry[];
  }

  public addBookmark(url: string, title: string, favicon: string) {
    if (!this.db) return;
    this.db.prepare(`
      INSERT INTO bookmarks (url, title, favicon, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(url) DO UPDATE SET title = excluded.title, favicon = excluded.favicon
    `).run(url, title, favicon, Date.now());
  }

  public removeBookmark(url: string) {
    if (!this.db) return;
    this.db.prepare('DELETE FROM bookmarks WHERE url = ?').run(url);
  }

  public isBookmarked(url: string): boolean {
    if (!this.db) return false;
    return !!this.db.prepare('SELECT 1 FROM bookmarks WHERE url = ?').get(url);
  }

  public queryBookmarks(query: string, limit = 4): Bookmark[] {
    if (!this.db || !query.trim()) return [];
    const pattern = `%${query}%`;
    return this.db.prepare(`
      SELECT url, title, favicon, created_at
      FROM bookmarks WHERE url LIKE ? OR title LIKE ?
      ORDER BY created_at DESC LIMIT ?
    `).all(pattern, pattern, limit) as Bookmark[];
  }

  public close() {
    this.db?.close();
  }
}
