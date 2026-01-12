// Queue processor with retry logic for NeetSync

import type { QueueItem, Settings as SettingsType, Mapping as MappingType } from './types';
import {
  getQueue,
  saveQueue,
  removeFromQueue,
  updateQueueItem,
  getSettings,
  getToken,
  getMapping,
  updateSolved,
  setLastSync,
  getProgress,
} from './storage';
import { commitSolutionFile } from './github';
import { buildFilePath, generateHeader, sha256, slugToTitle } from './normalize';
import { syncProgressFiles } from './progress';
import { logger } from './logger';

const MAX_RETRIES = 5;
const BASE_DELAY = 1000; // 1 second
const MAX_DELAY = 60000; // 1 minute

let isProcessing = false;

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(retries: number): number {
  const delay = BASE_DELAY * Math.pow(2, retries);
  return Math.min(delay, MAX_DELAY);
}

/**
 * Process a single queue item
 */
async function processItem(
  item: QueueItem,
  settings: SettingsType,
  token: string,
  mapping: MappingType
): Promise<boolean> {
  const mappingEntry = mapping.entries[item.slug];
  
  // Build file path
  const filePath = buildFilePath(
    settings,
    item.slug,
    item.title,
    item.language,
    mappingEntry,
    item.difficulty
  );
  
  // Build content with optional header
  let content = item.code;
  if (settings.includeHeader) {
    const header = generateHeader(
      item.slug,
      item.title,
      item.difficulty || mappingEntry?.difficulty,
      item.category || mappingEntry?.category,
      item.listName || mappingEntry?.listName,
      item.language,
      item.meta?.runtime,
      item.meta?.memory,
      item.at
    );
    content = header + content;
  }
  
  // Commit to GitHub
  const commitMessage = `✅ Solve: ${item.title}`;
  const result = await commitSolutionFile(
    token,
    settings.repoFullName,
    settings.branch,
    filePath,
    content,
    commitMessage,
    settings.overwrite
  );
  
  return result.success;
}

/**
 * Process the sync queue
 */
export async function processQueue(): Promise<void> {
  if (isProcessing) {
    await logger.info('Queue processing already in progress');
    return;
  }
  
  isProcessing = true;
  
  try {
    const queue = await getQueue();
    if (queue.length === 0) {
      return;
    }
    
    const settings = await getSettings();
    const token = await getToken();
    const mapping = await getMapping();
    
    if (!token || !settings.repoFullName) {
      await logger.warn('GitHub not configured, skipping queue processing');
      return;
    }
    
    await logger.info(`Processing ${queue.length} queued items`);
    
    const progress = await getProgress();
    let processedCount = 0;
    let errorCount = 0;
    
    for (const item of queue) {
      // Check if we should retry based on backoff
      if (item.lastAttempt && item.retries > 0) {
        const delay = getBackoffDelay(item.retries - 1);
        const timeSinceLastAttempt = Date.now() - item.lastAttempt;
        if (timeSinceLastAttempt < delay) {
          continue; // Skip, not ready for retry yet
        }
      }
      
      try {
        const success = await processItem(item, settings, token, mapping);
        
        if (success) {
          // Update progress
          const codeHash = await sha256(item.slug + item.language + item.code);
          await updateSolved(item.slug, {
            title: item.title,
            category: item.category || mapping.entries[item.slug]?.category,
            listName: item.listName || mapping.entries[item.slug]?.listName,
            difficulty: item.difficulty || mapping.entries[item.slug]?.difficulty,
            language: item.language,
            solvedAt: item.at,
            sha256: codeHash,
          });
          
          // Remove from queue
          await removeFromQueue(item.id);
          processedCount++;
        } else {
          throw new Error('Commit failed');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        
        if (item.retries >= MAX_RETRIES) {
          await logger.error(
            `Max retries reached for ${item.title}, removing from queue`,
            message
          );
          await removeFromQueue(item.id);
          errorCount++;
        } else {
          await updateQueueItem(item.id, {
            retries: item.retries + 1,
            lastAttempt: Date.now(),
          });
          await logger.warn(
            `Retry ${item.retries + 1}/${MAX_RETRIES} for ${item.title}`,
            message
          );
        }
      }
    }
    
    if (processedCount > 0) {
      // Sync progress files
      const updatedProgress = await getProgress();
      await syncProgressFiles(token, settings, updatedProgress, mapping);
      await setLastSync(Date.now());
      
      await logger.success(
        `Queue processed: ${processedCount} synced, ${errorCount} failed`
      );
    }
  } finally {
    isProcessing = false;
  }
}

/**
 * Add a submission to the queue with deduplication
 */
export async function enqueueSubmission(
  slug: string,
  title: string,
  code: string,
  language: string,
  category?: string,
  listName?: string,
  difficulty?: string,
  meta?: { runtime?: string; memory?: string },
  source: 'dom' | 'intercept' = 'dom'
): Promise<boolean> {
  const settings = await getSettings();
  const token = await getToken();
  const mapping = await getMapping();
  const localProgress = await getProgress();
  
  // Generate hash for deduplication
  const codeHash = await sha256(slug + language + code);
  
  // Check if we recently solved this exact problem with same code
  const existingSolved = localProgress.solved[slug];
  if (existingSolved) {
    const timeSinceSolved = Date.now() - existingSolved.solvedAt;
    if (existingSolved.sha256 === codeHash && timeSinceSolved < 60000) {
      await logger.info(`Duplicate submission ignored: ${title}`);
      return false;
    }
  }
  
  // Check if already in queue
  const queue = await getQueue();
  const existingInQueue = queue.find(
    (item) => item.slug === slug && item.language === language
  );
  
  if (existingInQueue) {
    // Update existing queue item with new code
    const existingHash = await sha256(
      existingInQueue.slug + existingInQueue.language + existingInQueue.code
    );
    if (existingHash === codeHash) {
      await logger.info(`Already queued: ${title}`);
      return false;
    }
    
    // Remove old entry
    await removeFromQueue(existingInQueue.id);
  }
  
  // Add to queue
  const newItem: Omit<QueueItem, 'id' | 'retries'> = {
    slug,
    title: title || slugToTitle(slug),
    category: category || mapping.entries[slug]?.category,
    listName: listName || mapping.entries[slug]?.listName,
    difficulty: difficulty || mapping.entries[slug]?.difficulty,
    language,
    code,
    meta,
    source,
    at: Date.now(),
  };
  
  queue.push({
    ...newItem,
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    retries: 0,
  });
  
  await saveQueue(queue);
  await logger.success(`Queued: ${title} (${language})`);
  
  // Trigger queue processing
  setTimeout(() => processQueue(), 100);
  
  return true;
}

/**
 * Get queue processing status
 */
export function isQueueProcessing(): boolean {
  return isProcessing;
}
