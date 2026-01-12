// Problem page content script - runs on NeetCode problem pages

import { SELECTORS, findElement, findAllElements, extractText, detectDifficulty, isAcceptedVerdict } from './dom_selectors';
import { injectInterceptor, setSubmissionInterceptCallback, isAcceptedVerdict as isInterceptAccepted } from './intercept_fetch';

console.log('[NeetSync Problem] Content script loaded');

interface SubmissionPayload {
  slug: string;
  title: string;
  category?: string;
  listName?: string;
  difficulty?: string;
  language?: string;
  code?: string;
  meta?: { runtime?: string; memory?: string };
  source: 'dom' | 'intercept';
  at: number;
}

// State
let lastSubmissionHash: string | null = null;
let _bridgeReady = false;
let pendingExtractionResolve: ((value: { code: string | null; language: string | null }) => void) | null = null;

/**
 * Extract slug from URL
 */
function getSlug(): string {
  const match = window.location.pathname.match(/\/problems\/([^\/]+)/);
  return match ? match[1] : 'unknown';
}

/**
 * Convert slug to title
 */
function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Extract problem title from page
 */
function getTitle(): string {
  const slug = getSlug();
  
  // Try various selectors
  for (const selector of SELECTORS.problemTitle) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        const text = extractText(element);
        // Filter out very short or navigation-like text
        if (text && text.length > 2 && text.length < 100) {
          // Remove common prefixes like problem numbers
          const cleaned = text.replace(/^\d+\.\s*/, '').trim();
          if (cleaned.length > 0) {
            return cleaned;
          }
        }
      }
    } catch {
      // Invalid selector, skip
    }
  }
  
  // Fallback to title case slug
  return slugToTitle(slug);
}

/**
 * Extract difficulty from page
 */
function getDifficulty(): string | undefined {
  // Method 1: Find difficulty badge elements
  const badges = findAllElements(SELECTORS.difficultyBadge);
  for (const badge of badges) {
    const diff = detectDifficulty(badge);
    if (diff) return diff;
  }
  
  // Method 2: Search page text for difficulty indicators
  const pageText = document.body.innerText;
  const diffMatch = pageText.match(/\b(Easy|Medium|Hard)\b/i);
  if (diffMatch) {
    return diffMatch[1].charAt(0).toUpperCase() + diffMatch[1].slice(1).toLowerCase();
  }
  
  return undefined;
}

/**
 * Extract category from page breadcrumbs or tags
 */
function getCategory(): string | undefined {
  // Check breadcrumbs
  const breadcrumbs = findAllElements(SELECTORS.breadcrumbs);
  for (const crumb of breadcrumbs) {
    const text = extractText(crumb);
    if (text && !text.toLowerCase().includes('problem') && !text.toLowerCase().includes('home')) {
      return text;
    }
  }
  
  // Check topic tags
  const tags = findAllElements(SELECTORS.topicTags);
  for (const tag of tags) {
    const text = extractText(tag);
    // Filter out common non-category tags
    if (text && text.length > 2 && text.length < 50) {
      const lower = text.toLowerCase();
      if (!['easy', 'medium', 'hard', 'solved', 'unsolved', 'premium'].includes(lower)) {
        return text;
      }
    }
  }
  
  return undefined;
}

/**
 * Inject the editor bridge script
 */
function injectEditorBridge(): void {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('content/inject_editor_bridge.js');
  script.onload = () => script.remove();
  document.documentElement.appendChild(script);
}

/**
 * Request code extraction from the injected bridge
 */
function requestCodeExtraction(): Promise<{ code: string | null; language: string | null }> {
  return new Promise((resolve) => {
    pendingExtractionResolve = resolve;
    
    // Set timeout - if bridge doesn't respond, try DOM extraction
    setTimeout(() => {
      if (pendingExtractionResolve === resolve) {
        pendingExtractionResolve = null;
        // Fallback to DOM extraction
        const domResult = extractCodeFromDOM();
        resolve(domResult);
      }
    }, 2000);
    
    // Dispatch extraction request
    document.dispatchEvent(new CustomEvent('neetsync-extract-request'));
  });
}

/**
 * Extract code directly from DOM (fallback when bridge fails)
 */
function extractCodeFromDOM(): { code: string | null; language: string | null } {
  let code: string | null = null;
  let language: string | null = null;
  
  console.log('[NeetSync Problem] Attempting DOM code extraction...');
  
  // Try Monaco editor - multiple selectors for different Monaco versions
  // NeetCode uses Monaco, check various possible structures
  const monacoContainers = [
    '.monaco-editor .view-lines',
    '.monaco-editor .lines-content',
    '[data-mode-id] .view-lines',
    '.editor-container .view-lines'
  ];
  
  for (const containerSel of monacoContainers) {
    const container = document.querySelector(containerSel);
    if (container) {
      const viewLines = container.querySelectorAll('.view-line');
      console.log(`[NeetSync Problem] Found ${viewLines.length} view-lines in ${containerSel}`);
      if (viewLines.length > 0) {
        const lines: string[] = [];
        viewLines.forEach((line) => {
          // Get text content, preserving structure
          lines.push(line.textContent || '');
        });
        code = lines.join('\n');
        if (code.trim().length > 10) {
          console.log('[NeetSync Problem] Extracted code from Monaco DOM:', code.length, 'chars');
          break;
        }
      }
    }
  }
  
  // Try getting code from Monaco's textarea (hidden but contains full code)
  if (!code) {
    const monacoTextarea = document.querySelector('.monaco-editor textarea.inputarea');
    if (monacoTextarea) {
      console.log('[NeetSync Problem] Found Monaco textarea');
    }
  }
  
  // Try CodeMirror (v5 and v6)
  if (!code) {
    // CodeMirror 6
    const cm6 = document.querySelector('.cm-editor .cm-content');
    if (cm6) {
      const lines: string[] = [];
      cm6.querySelectorAll('.cm-line').forEach((line) => {
        lines.push(line.textContent || '');
      });
      code = lines.join('\n');
      if (code.trim().length > 10) {
        console.log('[NeetSync Problem] Extracted code from CodeMirror 6:', code.length, 'chars');
      } else {
        code = null;
      }
    }
    
    // CodeMirror 5
    if (!code) {
      const cmContent = document.querySelector('.CodeMirror-code');
      if (cmContent) {
        const lines: string[] = [];
        cmContent.querySelectorAll('.CodeMirror-line').forEach((line) => {
          lines.push(line.textContent || '');
        });
        code = lines.join('\n');
        if (code.trim().length > 10) {
          console.log('[NeetSync Problem] Extracted code from CodeMirror 5:', code.length, 'chars');
        } else {
          code = null;
        }
      }
    }
  }
  
  // Try Ace editor
  if (!code) {
    const aceContent = document.querySelector('.ace_content');
    if (aceContent) {
      const lines: string[] = [];
      aceContent.querySelectorAll('.ace_line').forEach((line) => {
        lines.push(line.textContent || '');
      });
      code = lines.join('\n');
      if (code.trim().length > 10) {
        console.log('[NeetSync Problem] Extracted code from Ace DOM:', code.length, 'chars');
      } else {
        code = null;
      }
    }
  }
  
  // Try any textarea with code-like content
  if (!code) {
    const textareas = document.querySelectorAll('textarea');
    console.log(`[NeetSync Problem] Found ${textareas.length} textareas`);
    for (const ta of textareas) {
      if (ta.value && ta.value.length > 20) {
        code = ta.value;
        console.log('[NeetSync Problem] Extracted code from textarea:', code.length, 'chars');
        break;
      }
    }
  }
  
  // Last resort: try to find any pre/code blocks
  if (!code) {
    const codeBlocks = document.querySelectorAll('pre code, .code-container, [class*="editor"] pre');
    console.log(`[NeetSync Problem] Found ${codeBlocks.length} code blocks`);
    for (const block of codeBlocks) {
      const text = block.textContent || '';
      if (text.length > 20) {
        code = text;
        console.log('[NeetSync Problem] Extracted code from code block:', code.length, 'chars');
        break;
      }
    }
  }
  
  if (!code) {
    console.log('[NeetSync Problem] DOM extraction failed - no code found');
    // Log available elements for debugging
    console.log('[NeetSync Problem] Debug: monaco-editor elements:', document.querySelectorAll('.monaco-editor').length);
    console.log('[NeetSync Problem] Debug: view-line elements:', document.querySelectorAll('.view-line').length);
    console.log('[NeetSync Problem] Debug: cm-editor elements:', document.querySelectorAll('.cm-editor').length);
  }
  
  // Get language from UI
  language = getLanguageFromUI();
  
  return { code, language };
}

/**
 * Get language from UI elements directly
 */
function getLanguageFromUI(): string | null {
  const selectors = [
    'button[class*="language"] span',
    'select[class*="language"]',
    '[class*="lang"] button span',
    '[class*="dropdown"] button span',
  ];
  
  for (const selector of selectors) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        const text = (el.textContent || '').trim().toLowerCase();
        if (text && text.length < 20 && !text.includes('select')) {
          return text;
        }
      }
    } catch {
      // Skip invalid selector
    }
  }
  
  return null;
}

/**
 * Extract runtime/memory stats from result panel
 */
function getStats(): { runtime?: string; memory?: string } {
  const stats: { runtime?: string; memory?: string } = {};
  
  const runtimeEl = findElement(SELECTORS.runtimeDisplay);
  if (runtimeEl) {
    const text = extractText(runtimeEl);
    const match = text.match(/(\d+\s*ms)/i);
    if (match) stats.runtime = match[1];
  }
  
  const memoryEl = findElement(SELECTORS.memoryDisplay);
  if (memoryEl) {
    const text = extractText(memoryEl);
    const match = text.match(/(\d+\.?\d*\s*(MB|KB))/i);
    if (match) stats.memory = match[1];
  }
  
  return stats;
}

/**
 * Generate a simple hash for deduplication
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Send submission to background
 */
async function sendSubmission(source: 'dom' | 'intercept', overrideCode?: string, overrideLanguage?: string): Promise<void> {
  const slug = getSlug();
  const title = getTitle();
  
  // Get code and language
  let code = overrideCode;
  let language = overrideLanguage;
  
  if (!code || !language) {
    const extracted = await requestCodeExtraction();
    code = code || extracted.code || undefined;
    language = language || extracted.language || getLanguageFromUI() || undefined;
  }
  
  if (!code) {
    console.warn('[NeetSync Problem] Could not extract code');
    return;
  }
  
  // Deduplication
  const hash = simpleHash(slug + (language || '') + code);
  if (hash === lastSubmissionHash) {
    console.log('[NeetSync Problem] Duplicate submission, skipping');
    return;
  }
  lastSubmissionHash = hash;
  
  // Reset hash after 60 seconds to allow resubmissions
  setTimeout(() => {
    if (lastSubmissionHash === hash) {
      lastSubmissionHash = null;
    }
  }, 60000);
  
  const payload: SubmissionPayload = {
    slug,
    title,
    category: getCategory(),
    difficulty: getDifficulty(),
    language: language || 'unknown',
    code,
    meta: getStats(),
    source,
    at: Date.now(),
  };
  
  console.log('[NeetSync Problem] Sending submission:', payload.title);
  
  try {
    await chrome.runtime.sendMessage({
      type: 'NEETSYNC_SUBMISSION_ACCEPTED',
      payload,
    });
  } catch (error) {
    console.error('[NeetSync Problem] Failed to send submission:', error);
  }
}

/**
 * Find and attach listener to submit button
 */
function attachSubmitListener(): void {
  // Find submit button
  const buttons = document.querySelectorAll('button');
  let submitButton: HTMLButtonElement | null = null;
  
  for (const button of buttons) {
    const text = (button.textContent || '').toLowerCase().trim();
    if (text === 'submit' || text.includes('submit')) {
      submitButton = button;
      break;
    }
  }
  
  if (!submitButton) {
    console.log('[NeetSync Problem] Submit button not found, retrying...');
    setTimeout(attachSubmitListener, 1000);
    return;
  }
  
  console.log('[NeetSync Problem] Submit button found, attaching listener');
  
  submitButton.addEventListener('click', () => {
    console.log('[NeetSync Problem] Submit button clicked, watching for verdict...');
    watchForVerdict();
  });
}

/**
 * Watch for verdict after submission
 */
function watchForVerdict(): void {
  let found = false;
  const startTime = Date.now();
  const timeout = 30000; // 30 seconds
  
  // Method 1: MutationObserver
  const observer = new MutationObserver((mutations) => {
    if (found) return;
    
    for (const mutation of mutations) {
      // Check added nodes
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) {
          if (checkForAccepted(node)) {
            found = true;
            observer.disconnect();
            handleAccepted();
            return;
          }
        }
      }
      
      // Check modified text
      if (mutation.type === 'characterData' || mutation.type === 'childList') {
        const target = mutation.target;
        if (target instanceof Element && checkForAccepted(target)) {
          found = true;
          observer.disconnect();
          handleAccepted();
          return;
        }
      }
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  
  // Method 2: Polling fallback
  const pollInterval = setInterval(() => {
    if (found) {
      clearInterval(pollInterval);
      return;
    }
    
    if (Date.now() - startTime > timeout) {
      clearInterval(pollInterval);
      observer.disconnect();
      console.log('[NeetSync Problem] Verdict detection timed out');
      return;
    }
    
    // Check entire page for accepted verdict
    const resultPanels = findAllElements(SELECTORS.resultPanel);
    for (const panel of resultPanels) {
      if (checkForAccepted(panel)) {
        found = true;
        clearInterval(pollInterval);
        observer.disconnect();
        handleAccepted();
        return;
      }
    }
    
    // Also check for green success indicators
    const successElements = document.querySelectorAll('.text-green-500, .bg-green-500, [class*="success"], [class*="accepted"]');
    for (const el of successElements) {
      if (isAcceptedVerdict(el)) {
        found = true;
        clearInterval(pollInterval);
        observer.disconnect();
        handleAccepted();
        return;
      }
    }
  }, 500);
  
  // Cleanup after timeout
  setTimeout(() => {
    observer.disconnect();
    clearInterval(pollInterval);
  }, timeout + 1000);
}

/**
 * Check if an element contains an accepted verdict
 */
function checkForAccepted(element: Element): boolean {
  const text = (element.textContent || '').toLowerCase();
  
  return (
    text.includes('accepted') ||
    text.includes('all test cases passed') ||
    (text.includes('success') && !text.includes('unsuccessful'))
  );
}

/**
 * Handle accepted verdict
 */
function handleAccepted(): void {
  console.log('[NeetSync Problem] Accepted verdict detected!');
  
  // Small delay to ensure stats are populated
  setTimeout(() => {
    sendSubmission('dom');
  }, 500);
}

/**
 * Initialize the content script
 */
function init(): void {
  // Inject editor bridge
  injectEditorBridge();
  
  // Listen for bridge ready
  document.addEventListener('neetsync-bridge-ready', () => {
    _bridgeReady = true;
    console.log('[NeetSync Problem] Editor bridge ready');
  });
  
  // Listen for extraction results
  document.addEventListener('neetsync-extraction-result', ((event: CustomEvent) => {
    if (pendingExtractionResolve) {
      pendingExtractionResolve(event.detail);
      pendingExtractionResolve = null;
    }
  }) as EventListener);
  
  // Attach submit listener after page loads
  if (document.readyState === 'complete') {
    attachSubmitListener();
  } else {
    window.addEventListener('load', () => {
      setTimeout(attachSubmitListener, 500);
    });
  }
  
  // Set up fetch interceptor as fallback
  injectInterceptor();
  
  setSubmissionInterceptCallback((intercepted) => {
    console.log('[NeetSync Problem] Intercepted submission:', intercepted);
    
    if (intercepted.verdict && isInterceptAccepted(intercepted.verdict)) {
      console.log('[NeetSync Problem] Accepted via intercept!');
      sendSubmission(
        'intercept',
        intercepted.code,
        intercepted.language
      );
    }
  });
}

// Start
init();
