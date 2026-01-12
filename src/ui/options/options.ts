// Options page script for NeetSync
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

interface OptionsSettings {
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
}

interface OptionsState {
  settings: OptionsSettings;
  hasToken: boolean;
  mappingCount: number;
  solvedCount: number;
  queueCount: number;
}

// Elements
const elements = {
  repoInput: document.getElementById('repoInput') as HTMLInputElement,
  branchInput: document.getElementById('branchInput') as HTMLInputElement,
  baseDirInput: document.getElementById('baseDirInput') as HTMLInputElement,
  orgModeSelect: document.getElementById('orgModeSelect') as HTMLSelectElement,
  includeDifficultyFolder: document.getElementById('includeDifficultyFolder') as HTMLInputElement,
  includeListFolder: document.getElementById('includeListFolder') as HTMLInputElement,
  filenameIncludeSlug: document.getElementById('filenameIncludeSlug') as HTMLInputElement,
  includeHeader: document.getElementById('includeHeader') as HTMLInputElement,
  overwrite: document.getElementById('overwrite') as HTMLInputElement,
  debugMode: document.getElementById('debugMode') as HTMLInputElement,
  solvedCount: document.getElementById('solvedCount')!,
  mappingCount: document.getElementById('mappingCount')!,
  queueCount: document.getElementById('queueCount')!,
  exportDataBtn: document.getElementById('exportDataBtn')!,
  clearMappingBtn: document.getElementById('clearMappingBtn')!,
  clearAllBtn: document.getElementById('clearAllBtn')!,
  saveBtn: document.getElementById('saveBtn')!,
  saveStatus: document.getElementById('saveStatus')!,
};

// State
let currentState: OptionsState | null = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  setupEventListeners();
});

async function loadState(): Promise<void> {
  try {
    const response = await sendMessageWithTimeout<OptionsState>({ type: 'NEETSYNC_GET_STATE' });
    currentState = response;
    updateUI();
  } catch (error) {
    console.error('Failed to load state:', error);
    showStatus('Failed to load settings: ' + (error as Error).message, true);
  }
}

function updateUI(): void {
  if (!currentState) return;
  
  const settings = currentState.settings;
  
  // Form fields
  elements.repoInput.value = settings.repoFullName || '';
  elements.branchInput.value = settings.branch || 'main';
  elements.baseDirInput.value = settings.baseDir || 'NeetSync';
  elements.orgModeSelect.value = settings.organizationMode || 'AUTO';
  
  // Checkboxes
  elements.includeDifficultyFolder.checked = settings.includeDifficultyFolder || false;
  elements.includeListFolder.checked = settings.includeListFolderWhenKnown !== false;
  elements.filenameIncludeSlug.checked = settings.filenameIncludeSlug || false;
  elements.includeHeader.checked = settings.includeHeader !== false;
  elements.overwrite.checked = settings.overwrite !== false;
  elements.debugMode.checked = settings.debugMode || false;
  
  // Stats
  elements.solvedCount.textContent = currentState.solvedCount.toString();
  elements.mappingCount.textContent = currentState.mappingCount.toString();
  elements.queueCount.textContent = currentState.queueCount.toString();
}

function setupEventListeners(): void {
  elements.saveBtn.addEventListener('click', saveSettings);
  elements.exportDataBtn.addEventListener('click', exportData);
  elements.clearMappingBtn.addEventListener('click', clearMapping);
  elements.clearAllBtn.addEventListener('click', clearAllData);
}

async function saveSettings(): Promise<void> {
  const settings: Partial<OptionsSettings> = {
    repoFullName: elements.repoInput.value.trim(),
    branch: elements.branchInput.value.trim() || 'main',
    baseDir: elements.baseDirInput.value.trim() || 'NeetSync',
    organizationMode: elements.orgModeSelect.value,
    includeDifficultyFolder: elements.includeDifficultyFolder.checked,
    includeListFolderWhenKnown: elements.includeListFolder.checked,
    filenameIncludeSlug: elements.filenameIncludeSlug.checked,
    includeHeader: elements.includeHeader.checked,
    overwrite: elements.overwrite.checked,
    debugMode: elements.debugMode.checked,
  };
  
  elements.saveBtn.setAttribute('disabled', 'true');
  elements.saveBtn.textContent = 'Saving...';
  
  try {
    await sendMessageWithTimeout({
      type: 'NEETSYNC_SAVE_SETTINGS',
      payload: settings,
    });
    
    showStatus('Settings saved!', false);
    await loadState();
  } catch (error) {
    console.error('Failed to save settings:', error);
    showStatus('Failed to save settings: ' + (error as Error).message, true);
  } finally {
    elements.saveBtn.removeAttribute('disabled');
    elements.saveBtn.textContent = 'Save Options';
  }
}

async function exportData(): Promise<void> {
  try {
    // Get all storage data
    const localData = await chrome.storage.local.get(null);
    const syncData = await chrome.storage.sync.get(null);
    
    const exportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      local: localData,
      sync: syncData,
    };
    
    // Create download
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `neetsync-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showStatus('Data exported!', false);
  } catch (error) {
    console.error('Failed to export data:', error);
    showStatus('Failed to export data', true);
  }
}

async function clearMapping(): Promise<void> {
  if (!confirm('Are you sure you want to clear the problem mapping? This will not affect your solved problems or settings.')) {
    return;
  }
  
  try {
    await chrome.storage.local.set({
      neetsync_mapping: { version: 1, updatedAt: 0, entries: {} },
    });
    
    showStatus('Mapping cleared!', false);
    await loadState();
  } catch (error) {
    console.error('Failed to clear mapping:', error);
    showStatus('Failed to clear mapping', true);
  }
}

async function clearAllData(): Promise<void> {
  if (!confirm('Are you sure you want to reset ALL NeetSync data? This will clear your solved problems, mappings, queue, and logs. This cannot be undone!')) {
    return;
  }
  
  if (!confirm('This is your final warning. All data will be permanently deleted. Continue?')) {
    return;
  }
  
  try {
    await chrome.storage.local.clear();
    await chrome.storage.sync.clear();
    
    showStatus('All data cleared!', false);
    await loadState();
  } catch (error) {
    console.error('Failed to clear data:', error);
    showStatus('Failed to clear data', true);
  }
}

function showStatus(message: string, isError: boolean): void {
  elements.saveStatus.textContent = message;
  elements.saveStatus.className = isError ? 'save-status error' : 'save-status';
  
  // Clear status after 3 seconds
  setTimeout(() => {
    elements.saveStatus.textContent = '';
  }, 3000);
}
