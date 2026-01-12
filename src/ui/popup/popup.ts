// Popup script for NeetSync
export {};

// Helper to send message with timeout
async function sendMessageWithTimeout<T>(message: unknown, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Message timeout - service worker may not be responding'));
    }, timeoutMs);
    
    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response as T);
      }
    });
  });
}

interface PopupState {
  settings: {
    repoFullName: string;
    branch: string;
    baseDir: string;
    organizationMode: string;
    overwrite: boolean;
    includeHeader: boolean;
    includeDifficultyFolder: boolean;
    includeListFolderWhenKnown: boolean;
    filenameIncludeSlug: boolean;
    debugMode: boolean;
  };
  hasToken: boolean;
  mappingCount: number;
  mappingUpdatedAt: number;
  solvedCount: number;
  queueCount: number;
  lastSync: number | null;
  isProcessing: boolean;
  logs: Array<{
    id: string;
    timestamp: number;
    level: 'info' | 'warn' | 'error' | 'success';
    message: string;
    details?: string;
  }>;
}

// Elements
const elements = {
  statusIndicator: document.getElementById('statusIndicator')!,
  tokenInput: document.getElementById('tokenInput') as HTMLInputElement,
  toggleToken: document.getElementById('toggleToken')!,
  repoInput: document.getElementById('repoInput') as HTMLInputElement,
  branchInput: document.getElementById('branchInput') as HTMLInputElement,
  baseDirInput: document.getElementById('baseDirInput') as HTMLInputElement,
  orgModeSelect: document.getElementById('orgModeSelect') as HTMLSelectElement,
  saveSettingsBtn: document.getElementById('saveSettingsBtn')!,
  solvedCount: document.getElementById('solvedCount')!,
  queueCount: document.getElementById('queueCount')!,
  mappingCount: document.getElementById('mappingCount')!,
  lastSyncInfo: document.getElementById('lastSyncInfo')!,
  refreshMappingBtn: document.getElementById('refreshMappingBtn')!,
  syncProgressBtn: document.getElementById('syncProgressBtn')!,
  processQueueBtn: document.getElementById('processQueueBtn')!,
  optionsBtn: document.getElementById('optionsBtn')!,
  clearLogsBtn: document.getElementById('clearLogsBtn')!,
  logsContainer: document.getElementById('logsContainer')!,
};

// State
let currentState: PopupState | null = null;
let tokenVisible = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  setupEventListeners();
});

async function loadState(): Promise<void> {
  try {
    const response = await sendMessageWithTimeout<PopupState>({ type: 'NEETSYNC_GET_STATE' });
    currentState = response;
    updateUI();
  } catch (error) {
    console.error('Failed to load state:', error);
    showToast('Failed to load state: ' + (error as Error).message, 'error');
  }
}

function updateUI(): void {
  if (!currentState) return;
  
  // Update status indicator
  if (currentState.isProcessing) {
    elements.statusIndicator.className = 'status-indicator processing';
  } else if (currentState.hasToken && currentState.settings.repoFullName) {
    elements.statusIndicator.className = 'status-indicator connected';
  } else {
    elements.statusIndicator.className = 'status-indicator';
  }
  
  // Update form fields (don't update token)
  elements.repoInput.value = currentState.settings.repoFullName || '';
  elements.branchInput.value = currentState.settings.branch || 'main';
  elements.baseDirInput.value = currentState.settings.baseDir || 'NeetSync';
  elements.orgModeSelect.value = currentState.settings.organizationMode || 'AUTO';
  
  // Update stats
  elements.solvedCount.textContent = currentState.solvedCount.toString();
  elements.queueCount.textContent = currentState.queueCount.toString();
  elements.mappingCount.textContent = currentState.mappingCount.toString();
  
  // Update last sync
  if (currentState.lastSync) {
    const date = new Date(currentState.lastSync);
    elements.lastSyncInfo.textContent = `Last sync: ${formatRelativeTime(date)}`;
  } else {
    elements.lastSyncInfo.textContent = 'Never synced';
  }
  
  // Update logs
  renderLogs();
}

function renderLogs(): void {
  if (!currentState || currentState.logs.length === 0) {
    elements.logsContainer.innerHTML = '<div class="log-empty">No activity yet</div>';
    return;
  }
  
  const logsHtml = currentState.logs.slice(0, 50).map((log) => {
    const icon = getLogIcon(log.level);
    const time = new Date(log.timestamp).toLocaleTimeString();
    
    return `
      <div class="log-entry ${log.level}">
        <span class="log-icon">${icon}</span>
        <div class="log-content">
          <div class="log-message">${escapeHtml(log.message)}</div>
          <div class="log-time">${time}</div>
        </div>
      </div>
    `;
  }).join('');
  
  elements.logsContainer.innerHTML = logsHtml;
}

function getLogIcon(level: string): string {
  switch (level) {
    case 'success': return '✓';
    case 'error': return '✗';
    case 'warn': return '⚠';
    default: return 'ℹ';
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

function setupEventListeners(): void {
  // Toggle token visibility
  elements.toggleToken.addEventListener('click', () => {
    tokenVisible = !tokenVisible;
    elements.tokenInput.type = tokenVisible ? 'text' : 'password';
    elements.toggleToken.textContent = tokenVisible ? '🙈' : '👁️';
  });
  
  // Save settings
  elements.saveSettingsBtn.addEventListener('click', saveSettings);
  
  // Actions
  elements.refreshMappingBtn.addEventListener('click', refreshMapping);
  elements.syncProgressBtn.addEventListener('click', syncProgress);
  elements.processQueueBtn.addEventListener('click', processQueue);
  elements.optionsBtn.addEventListener('click', openOptions);
  elements.clearLogsBtn.addEventListener('click', clearLogs);
}

async function saveSettings(): Promise<void> {
  const token = elements.tokenInput.value.trim();
  const repoFullName = elements.repoInput.value.trim();
  const branch = elements.branchInput.value.trim() || 'main';
  const baseDir = elements.baseDirInput.value.trim() || 'NeetSync';
  const organizationMode = elements.orgModeSelect.value;
  
  if (!repoFullName) {
    showToast('Please enter a repository', 'error');
    return;
  }
  
  if (!repoFullName.includes('/')) {
    showToast('Repository must be in format owner/repo', 'error');
    return;
  }
  
  elements.saveSettingsBtn.setAttribute('disabled', 'true');
  elements.saveSettingsBtn.textContent = 'Saving...';
  
  try {
    // Save token if provided
    if (token) {
      const tokenResult = await sendMessageWithTimeout<{success: boolean; error?: string}>({
        type: 'NEETSYNC_SAVE_TOKEN',
        payload: { token },
      });
      
      if (!tokenResult.success) {
        showToast(tokenResult.error || 'Invalid token', 'error');
        return;
      }
    }
    
    // Save settings
    await sendMessageWithTimeout({
      type: 'NEETSYNC_SAVE_SETTINGS',
      payload: {
        repoFullName,
        branch,
        baseDir,
        organizationMode,
      },
    });
    
    showToast('Settings saved!', 'success');
    
    // Clear token input after saving
    elements.tokenInput.value = '';
    
    // Reload state
    await loadState();
  } catch (error) {
    console.error('Failed to save settings:', error);
    showToast('Failed to save settings', 'error');
  } finally {
    elements.saveSettingsBtn.removeAttribute('disabled');
    elements.saveSettingsBtn.textContent = 'Save Settings';
  }
}

async function refreshMapping(): Promise<void> {
  elements.refreshMappingBtn.setAttribute('disabled', 'true');
  
  try {
    const result = await sendMessageWithTimeout<{success: boolean}>({
      type: 'NEETSYNC_REFRESH_MAPPING_FROM_ACTIVE_TAB',
    });
    
    if (result.success) {
      showToast('Mapping refresh requested', 'success');
      // Reload state after a delay
      setTimeout(loadState, 1000);
    } else {
      showToast('Open a NeetCode list page first', 'error');
    }
  } catch (error) {
    console.error('Failed to refresh mapping:', error);
    showToast('Failed to refresh mapping', 'error');
  } finally {
    elements.refreshMappingBtn.removeAttribute('disabled');
  }
}

async function syncProgress(): Promise<void> {
  elements.syncProgressBtn.setAttribute('disabled', 'true');
  
  try {
    const result = await sendMessageWithTimeout<{success: boolean; error?: string}>({
      type: 'NEETSYNC_SYNC_PROGRESS_NOW',
    });
    
    if (result.success) {
      showToast('Progress synced!', 'success');
      await loadState();
    } else {
      showToast(result.error || 'Sync failed', 'error');
    }
  } catch (error) {
    console.error('Failed to sync progress:', error);
    showToast('Failed to sync progress', 'error');
  } finally {
    elements.syncProgressBtn.removeAttribute('disabled');
  }
}

async function processQueue(): Promise<void> {
  elements.processQueueBtn.setAttribute('disabled', 'true');
  
  try {
    await sendMessageWithTimeout({
      type: 'NEETSYNC_PROCESS_QUEUE',
    });
    
    showToast('Queue processing started', 'success');
    
    // Reload state after processing
    setTimeout(loadState, 2000);
  } catch (error) {
    console.error('Failed to process queue:', error);
    showToast('Failed to process queue', 'error');
  } finally {
    elements.processQueueBtn.removeAttribute('disabled');
  }
}

function openOptions(): void {
  chrome.runtime.openOptionsPage();
}

async function clearLogs(): Promise<void> {
  try {
    await sendMessageWithTimeout({
      type: 'NEETSYNC_CLEAR_LOGS',
    });
    
    await loadState();
    showToast('Logs cleared', 'success');
  } catch (error) {
    console.error('Failed to clear logs:', error);
  }
}

function showToast(message: string, type: 'success' | 'error'): void {
  // Remove existing toasts
  const existing = document.querySelector('.toast');
  if (existing) {
    existing.remove();
  }
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Auto-refresh state periodically
setInterval(() => {
  if (document.visibilityState === 'visible') {
    loadState();
  }
}, 5000);
