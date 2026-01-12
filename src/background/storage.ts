// Storage utilities for NeetSync

import type { Settings, Mapping, Progress, QueueItem } from './types';
import { DEFAULT_SETTINGS } from './types';

const KEYS = {
  settings: 'neetsync_settings',
  token: 'neetsync_github_token',
  mapping: 'neetsync_mapping',
  progress: 'neetsync_progress',
  queue: 'neetsync_queue',
  lastSync: 'neetsync_last_sync',
} as const;

// Settings
export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get(KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...(result[KEYS.settings] || {}) };
}

export async function saveSettings(settings: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const updated = { ...current, ...settings };
  await chrome.storage.sync.set({ [KEYS.settings]: updated });
  return updated;
}

// GitHub Token (stored locally for security)
export async function getToken(): Promise<string | null> {
  const result = await chrome.storage.local.get(KEYS.token);
  return result[KEYS.token] || null;
}

export async function saveToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [KEYS.token]: token });
}

// Mapping
export async function getMapping(): Promise<Mapping> {
  const result = await chrome.storage.local.get(KEYS.mapping);
  return result[KEYS.mapping] || { version: 1, updatedAt: 0, entries: {} };
}

export async function saveMapping(mapping: Mapping): Promise<void> {
  await chrome.storage.local.set({ [KEYS.mapping]: mapping });
}

export async function mergeMapping(
  newEntries: Record<string, { title?: string; category?: string; listName?: string; difficulty?: string; sourceUrl: string }>
): Promise<Mapping> {
  const current = await getMapping();
  
  for (const [slug, entry] of Object.entries(newEntries)) {
    const existing = current.entries[slug] || {};
    
    // Merge non-empty values, don't overwrite with empty
    current.entries[slug] = {
      title: entry.title || existing.title,
      category: entry.category || existing.category,
      listName: entry.listName || existing.listName,
      difficulty: entry.difficulty || existing.difficulty,
      sources: [...new Set([...(existing.sources || []), entry.sourceUrl])],
    };
  }
  
  current.updatedAt = Date.now();
  await saveMapping(current);
  return current;
}

// Progress
export async function getProgress(): Promise<Progress> {
  const result = await chrome.storage.local.get(KEYS.progress);
  return result[KEYS.progress] || { solved: {} };
}

export async function saveProgress(progress: Progress): Promise<void> {
  await chrome.storage.local.set({ [KEYS.progress]: progress });
}

export async function updateSolved(
  slug: string,
  data: {
    title: string;
    category?: string;
    listName?: string;
    difficulty?: string;
    language: string;
    solvedAt: number;
    sha256?: string;
  }
): Promise<Progress> {
  const progress = await getProgress();
  progress.solved[slug] = {
    ...progress.solved[slug],
    ...data,
  };
  await saveProgress(progress);
  return progress;
}

// Queue
export async function getQueue(): Promise<QueueItem[]> {
  const result = await chrome.storage.local.get(KEYS.queue);
  return result[KEYS.queue] || [];
}

export async function saveQueue(queue: QueueItem[]): Promise<void> {
  await chrome.storage.local.set({ [KEYS.queue]: queue });
}

export async function addToQueue(item: Omit<QueueItem, 'id' | 'retries'>): Promise<QueueItem> {
  const queue = await getQueue();
  const newItem: QueueItem = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    retries: 0,
  };
  queue.push(newItem);
  await saveQueue(queue);
  return newItem;
}

export async function removeFromQueue(id: string): Promise<void> {
  const queue = await getQueue();
  const filtered = queue.filter((item) => item.id !== id);
  await saveQueue(filtered);
}

export async function updateQueueItem(id: string, updates: Partial<QueueItem>): Promise<void> {
  const queue = await getQueue();
  const index = queue.findIndex((item) => item.id === id);
  if (index !== -1) {
    queue[index] = { ...queue[index], ...updates };
    await saveQueue(queue);
  }
}

// Last Sync
export async function getLastSync(): Promise<number | null> {
  const result = await chrome.storage.local.get(KEYS.lastSync);
  return result[KEYS.lastSync] || null;
}

export async function setLastSync(timestamp: number): Promise<void> {
  await chrome.storage.local.set({ [KEYS.lastSync]: timestamp });
}
