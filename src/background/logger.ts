// Logger with ring buffer for NeetSync

import type { LogEntry } from './types';

const MAX_LOGS = 100;
const LOGS_KEY = 'neetsync_logs';

export class Logger {
  private logs: LogEntry[] = [];
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    const result = await chrome.storage.local.get(LOGS_KEY);
    this.logs = result[LOGS_KEY] || [];
    this.initialized = true;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async persist(): Promise<void> {
    await chrome.storage.local.set({ [LOGS_KEY]: this.logs });
  }

  private async addLog(
    level: LogEntry['level'],
    message: string,
    details?: string
  ): Promise<void> {
    await this.init();
    
    const entry: LogEntry = {
      id: this.generateId(),
      timestamp: Date.now(),
      level,
      message,
      details,
    };

    this.logs.unshift(entry);
    
    // Keep only last MAX_LOGS entries
    if (this.logs.length > MAX_LOGS) {
      this.logs = this.logs.slice(0, MAX_LOGS);
    }

    await this.persist();
  }

  async info(message: string, details?: string): Promise<void> {
    console.log(`[NeetSync] ${message}`, details || '');
    await this.addLog('info', message, details);
  }

  async warn(message: string, details?: string): Promise<void> {
    console.warn(`[NeetSync] ${message}`, details || '');
    await this.addLog('warn', message, details);
  }

  async error(message: string, details?: string): Promise<void> {
    console.error(`[NeetSync] ${message}`, details || '');
    await this.addLog('error', message, details);
  }

  async success(message: string, details?: string): Promise<void> {
    console.log(`[NeetSync] ✓ ${message}`, details || '');
    await this.addLog('success', message, details);
  }

  async getLogs(): Promise<LogEntry[]> {
    await this.init();
    return [...this.logs];
  }

  async clear(): Promise<void> {
    this.logs = [];
    await this.persist();
  }
}

export const logger = new Logger();
