// Catalog content script - runs on NeetCode list pages

import { isListPage, parseProblems, problemsToMappingEntries } from './parse_lists';

console.log('[NeetSync Catalog] Content script loaded');

// Only run parsing if this looks like a list page
function initCatalog(): void {
  // Early exit if not enough problem links
  if (!isListPage()) {
    console.log('[NeetSync Catalog] Not a list page, skipping');
    return;
  }
  
  console.log('[NeetSync Catalog] List page detected, parsing problems');
  
  // Parse after a short delay to ensure page is fully loaded
  setTimeout(() => {
    parseAndSend();
  }, 1000);
  
  // Also parse on significant DOM changes (for dynamic content)
  const observer = new MutationObserver((mutations) => {
    // Check if mutations include new problem links
    let hasNewProblems = false;
    
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) {
            if (node.querySelector('a[href*="/problems/"]') || 
                (node.tagName === 'A' && node.getAttribute('href')?.includes('/problems/'))) {
              hasNewProblems = true;
              break;
            }
          }
        }
      }
      if (hasNewProblems) break;
    }
    
    if (hasNewProblems) {
      debounceParseAndSend();
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

let parseTimeout: ReturnType<typeof setTimeout> | null = null;

function debounceParseAndSend(): void {
  if (parseTimeout) {
    clearTimeout(parseTimeout);
  }
  parseTimeout = setTimeout(() => {
    parseAndSend();
  }, 500);
}

function parseAndSend(): void {
  const problems = parseProblems();
  
  if (problems.length === 0) {
    console.log('[NeetSync Catalog] No problems found');
    return;
  }
  
  console.log(`[NeetSync Catalog] Parsed ${problems.length} problems`);
  
  const entries = problemsToMappingEntries(problems, window.location.href);
  
  // Send to background
  chrome.runtime.sendMessage({
    type: 'NEETSYNC_MAPPING_MERGE',
    payload: {
      entries,
      updatedAt: Date.now(),
    },
  }).catch((error) => {
    console.error('[NeetSync Catalog] Failed to send mapping:', error);
  });
}

// Listen for manual parse requests from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'NEETSYNC_REQUEST_CATALOG_PARSE') {
    console.log('[NeetSync Catalog] Manual parse requested');
    parseAndSend();
    sendResponse({ success: true });
  }
  return true;
});

// Initialize
initCatalog();
