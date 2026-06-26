import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { TabManager } from './TabManager';

export class SessionManager {
  private sessionDir: string;
  private lockfilePath: string;
  private autoSaveTimer: NodeJS.Timeout | null = null;

  constructor() {
    const userData = app.getPath('userData');
    this.sessionDir = path.join(userData, 'sessions');
    this.lockfilePath = path.join(userData, 'canto.lock');
    
    // Ensure sessions directory exists
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  public checkCrashStatus(): boolean {
    return fs.existsSync(this.lockfilePath);
  }

  public createLockfile() {
    try {
      fs.writeFileSync(this.lockfilePath, 'active');
    } catch (err) {
      console.error('Failed to create lockfile:', err);
    }
  }

  public deleteLockfile() {
    try {
      if (fs.existsSync(this.lockfilePath)) {
        fs.unlinkSync(this.lockfilePath);
      }
    } catch (err) {
      console.error('Failed to delete lockfile:', err);
    }
  }

  public listSessions() {
    try {
      const files = fs.readdirSync(this.sessionDir);
      const sessions = [];
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'auto-session.json') {
          const filePath = path.join(this.sessionDir, file);
          const stat = fs.statSync(filePath);
          const content = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(content);
          
          sessions.push({
            name: file.replace('.json', ''),
            tabCount: data.tabs ? data.tabs.length : 0,
            saveDate: stat.mtimeMs
          });
        }
      }
      return sessions.sort((a, b) => b.saveDate - a.saveDate);
    } catch (err) {
      console.error('Failed to list sessions:', err);
      return [];
    }
  }

  public saveSession(name: string, tabs: any[], groups: any[]) {
    try {
      const sessionData = {
        tabs: tabs.map(t => ({
          id: t.id,
          url: t.url,
          title: t.title,
          groupId: t.groupId,
          isActive: t.isActive
        })),
        groups,
        timestamp: Date.now()
      };
      
      const filePath = path.join(this.sessionDir, `${name}.json`);
      fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2));
    } catch (err) {
      console.error(`Failed to save session ${name}:`, err);
    }
  }

  public loadSession(name: string, tabManager: TabManager) {
    try {
      const filePath = path.join(this.sessionDir, `${name}.json`);
      if (!fs.existsSync(filePath)) return false;

      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      
      if (data && Array.isArray(data.tabs)) {
        tabManager.setTabsAndGroups(data.tabs, data.groups || []);
        return true;
      }
      return false;
    } catch (err) {
      console.error(`Failed to load session ${name}:`, err);
      return false;
    }
  }

  public deleteSession(name: string) {
    try {
      const filePath = path.join(this.sessionDir, `${name}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.error(`Failed to delete session ${name}:`, err);
    }
  }

  public startAutoSave(tabManager: TabManager) {
    // Stop any existing timer
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    // Auto-save every 5 minutes
    this.autoSaveTimer = setInterval(() => {
      this.saveSession('auto-session', tabManager.getTabs(), tabManager.getGroups());
    }, 5 * 60 * 1000);
  }

  public saveAutoSession(tabManager: TabManager) {
    this.saveSession('auto-session', tabManager.getTabs(), tabManager.getGroups());
  }

  public restoreAutoSession(tabManager: TabManager): boolean {
    return this.loadSession('auto-session', tabManager);
  }

  public cleanup() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }
}
