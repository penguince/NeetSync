// Background service worker for NeetSync

import type { MessageType, Settings, SubmissionPayload, MappingMergePayload } from './types';
import {
  getSettings,
  saveSettings,
  getToken,
  saveToken,
  getMapping,
  mergeMapping,
  getProgress,
  getQueue,
  getLastSync,
} from './storage';
import { logger } from './logger';
import { enqueueSubmission, processQueue, isQueueProcessing } from './queue';
import { syncProgressFiles } from './progress';
import { GitHubClient } from './github';

// Initialize
console.log('[NeetSync] Background service worker started');

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[NeetSync] Received message:', message?.type);
  
  // Check if message has expected format
  if (!message || typeof message.type !== 'string') {
    console.warn('[NeetSync] Invalid message format:', message);
    sendResponse({ success: false, error: 'Invalid message format' });
    return true;
  }
  
  handleMessage(message as MessageType, sender)
    .then((result) => {
      console.log('[NeetSync] Message handled successfully:', message.type);
      sendResponse(result);
    })
    .catch((error) => {
      console.error('[NeetSync] Message handler error:', error);
      sendResponse({ success: false, error: error.message });
    });
  
  return true; // Keep message channel open for async response
});

async function handleMessage(
  message: MessageType,
  _sender: chrome.runtime.MessageSender
): Promise<unknown> {
  switch (message.type) {
    case 'NEETSYNC_SUBMISSION_ACCEPTED':
      return handleSubmission(message.payload);
    
    case 'NEETSYNC_MAPPING_MERGE':
      return handleMappingMerge(message.payload);
    
    case 'NEETSYNC_SAVE_SETTINGS':
      return handleSaveSettings(message.payload);
    
    case 'NEETSYNC_SAVE_TOKEN':
      return handleSaveToken(message.payload);
    
    case 'NEETSYNC_REFRESH_MAPPING_FROM_ACTIVE_TAB':
      return handleRefreshMapping();
    
    case 'NEETSYNC_SYNC_PROGRESS_NOW':
      return handleSyncProgressNow();
    
    case 'NEETSYNC_GET_STATE':
      return handleGetState();
    
    case 'NEETSYNC_CLEAR_LOGS':
      return handleClearLogs();
    
    case 'NEETSYNC_PROCESS_QUEUE':
      return handleProcessQueue();
    
    default:
      return { success: false, error: 'Unknown message type' };
  }
}

async function handleSubmission(payload: SubmissionPayload): Promise<{ success: boolean }> {
  await logger.info(
    `Submission received: ${payload.title}`,
    `Language: ${payload.language}, Source: ${payload.source}`
  );
  
  if (!payload.code) {
    await logger.warn('Submission has no code, skipping');
    return { success: false };
  }
  
  const added = await enqueueSubmission(
    payload.slug,
    payload.title,
    payload.code,
    payload.language || 'unknown',
    payload.category,
    payload.listName,
    payload.difficulty,
    payload.meta,
    payload.source
  );
  
  return { success: added };
}

async function handleMappingMerge(
  payload: MappingMergePayload
): Promise<{ success: boolean; count: number }> {
  const entriesCount = Object.keys(payload.entries).length;
  
  if (entriesCount === 0) {
    return { success: true, count: 0 };
  }
  
  const transformedEntries: Record<string, { title?: string; category?: string; listName?: string; difficulty?: string; sourceUrl: string }> = {};
  
  for (const [slug, entry] of Object.entries(payload.entries)) {
    transformedEntries[slug] = {
      title: entry.title,
      category: entry.category,
      listName: entry.listName,
      difficulty: entry.difficulty,
      sourceUrl: entry.sourceUrl,
    };
  }
  
  await mergeMapping(transformedEntries);
  await logger.info(`Mapping updated: ${entriesCount} entries merged`);
  
  return { success: true, count: entriesCount };
}

async function handleSaveSettings(
  settings: Partial<Settings>
): Promise<{ success: boolean; settings: Settings }> {
  const updated = await saveSettings(settings);
  await logger.info('Settings saved');
  return { success: true, settings: updated };
}

async function handleSaveToken(
  payload: { token: string }
): Promise<{ success: boolean; valid?: boolean; error?: string }> {
  const { token } = payload;
  
  // Validate token if repo is configured
  const settings = await getSettings();
  
  if (settings.repoFullName) {
    const client = new GitHubClient(token, settings.repoFullName);
    const result = await client.verifyAccess();
    
    if (!result.valid) {
      await logger.error('Token validation failed', result.error);
      return { success: false, valid: false, error: result.error };
    }
  }
  
  await saveToken(token);
  await logger.success('GitHub token saved');
  
  return { success: true, valid: true };
}

async function handleRefreshMapping(): Promise<{ success: boolean }> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab?.id || !tab.url?.includes('neetcode.io')) {
      await logger.warn('Active tab is not a NeetCode page');
      return { success: false };
    }
    
    // Send message to content script to parse the page
    await chrome.tabs.sendMessage(tab.id, { type: 'NEETSYNC_REQUEST_CATALOG_PARSE' });
    
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await logger.error('Failed to refresh mapping', message);
    return { success: false };
  }
}

async function handleSyncProgressNow(): Promise<{ success: boolean; error?: string }> {
  const token = await getToken();
  const settings = await getSettings();
  
  if (!token || !settings.repoFullName) {
    await logger.warn('GitHub not configured');
    return { success: false, error: 'GitHub not configured' };
  }
  
  const progress = await getProgress();
  const mapping = await getMapping();
  
  const result = await syncProgressFiles(token, settings, progress, mapping);
  
  return result;
}

async function handleGetState(): Promise<{
  settings: Settings;
  hasToken: boolean;
  mappingCount: number;
  mappingUpdatedAt: number;
  solvedCount: number;
  queueCount: number;
  lastSync: number | null;
  isProcessing: boolean;
  logs: unknown[];
}> {
  const settings = await getSettings();
  const token = await getToken();
  const mapping = await getMapping();
  const progress = await getProgress();
  const queue = await getQueue();
  const lastSync = await getLastSync();
  const logs = await logger.getLogs();
  
  return {
    settings,
    hasToken: !!token,
    mappingCount: Object.keys(mapping.entries).length,
    mappingUpdatedAt: mapping.updatedAt,
    solvedCount: Object.keys(progress.solved).length,
    queueCount: queue.length,
    lastSync,
    isProcessing: isQueueProcessing(),
    logs: logs.slice(0, 50), // Last 50 logs
  };
}

async function handleClearLogs(): Promise<{ success: boolean }> {
  await logger.clear();
  return { success: true };
}

async function handleProcessQueue(): Promise<{ success: boolean }> {
  await processQueue();
  return { success: true };
}

// Set up alarm for periodic queue processing
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('processQueue', { periodInMinutes: 1 });
  console.log('[NeetSync] Alarm created for queue processing');
});

// Also create alarm on startup (service worker wake)
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('processQueue', { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'processQueue') {
    await processQueue();
  }
});

// Log extension startup
console.log('[NeetSync] Service worker initialized');
logger.info('NeetSync extension started').catch(console.error);
