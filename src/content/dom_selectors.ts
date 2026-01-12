// DOM selectors for NeetCode pages
// These may need to be updated if NeetCode changes their UI

export const SELECTORS = {
  // Problem page elements
  problemTitle: [
    'h1',
    '[class*="problem-title"]',
    '[class*="title"]',
    '.text-2xl',
    '.text-xl',
  ],
  
  difficultyBadge: [
    '[class*="difficulty"]',
    '.bg-green-500', // Easy
    '.bg-yellow-500', // Medium
    '.bg-red-500', // Hard
    '[class*="Easy"]',
    '[class*="Medium"]',
    '[class*="Hard"]',
  ],
  
  submitButton: [
    'button:contains("Submit")',
    'button[class*="submit"]',
    '[data-testid="submit-btn"]',
    'button.bg-green-500',
    'button.bg-green-600',
  ],
  
  // Result/verdict elements
  resultPanel: [
    '[class*="result"]',
    '[class*="verdict"]',
    '[class*="output"]',
    '[class*="console"]',
  ],
  
  acceptedIndicator: [
    '[class*="accepted"]',
    '[class*="success"]',
    '.text-green-500',
    '.bg-green-500',
  ],
  
  // Language selector
  languageSelector: [
    'select[class*="language"]',
    'button[class*="language"]',
    '[class*="lang-select"]',
    '.monaco-editor',
  ],
  
  languageDisplay: [
    '[class*="language"] span',
    'select[class*="language"]',
    'button span',
  ],
  
  // Editor
  editorContainer: [
    '.monaco-editor',
    '[class*="editor"]',
    '[class*="CodeMirror"]',
  ],
  
  // Category/Topic breadcrumbs
  breadcrumbs: [
    '[class*="breadcrumb"]',
    'nav[aria-label="breadcrumb"]',
    '.flex.items-center.gap-2 a',
  ],
  
  topicTags: [
    '[class*="tag"]',
    '[class*="topic"]',
    '[class*="category"]',
    '.badge',
  ],
  
  // Runtime/Memory stats
  runtimeDisplay: [
    '[class*="runtime"]',
    '[class*="execution"]',
  ],
  
  memoryDisplay: [
    '[class*="memory"]',
  ],
};

// List page selectors
export const LIST_SELECTORS = {
  problemLink: [
    'a[href^="/problems/"]',
    'a[href*="/problems/"]',
  ],
  
  listTitle: [
    'h1',
    'h2',
    '[class*="title"]',
    '.text-3xl',
    '.text-2xl',
  ],
  
  categoryHeading: [
    'h2',
    'h3',
    '[class*="category"]',
    '[class*="section"]',
  ],
  
  problemRow: [
    'tr',
    '[class*="problem-row"]',
    '[class*="list-item"]',
    '.flex.items-center',
  ],
  
  difficultyInList: [
    '[class*="difficulty"]',
    '.text-green-500',
    '.text-yellow-500',
    '.text-red-500',
  ],
};

/**
 * Find element using multiple selector strategies
 */
export function findElement(selectors: string[], container: Element | Document = document): Element | null {
  for (const selector of selectors) {
    try {
      // Handle :contains() pseudo-selector (not native CSS)
      if (selector.includes(':contains(')) {
        const match = selector.match(/(.+):contains\("(.+)"\)/);
        if (match) {
          const [, baseSelector, text] = match;
          const elements = container.querySelectorAll(baseSelector);
          for (const el of elements) {
            if (el.textContent?.includes(text)) {
              return el;
            }
          }
        }
        continue;
      }
      
      const element = container.querySelector(selector);
      if (element) {
        return element;
      }
    } catch {
      // Invalid selector, skip
    }
  }
  return null;
}

/**
 * Find all elements using multiple selector strategies
 */
export function findAllElements(selectors: string[], container: Element | Document = document): Element[] {
  const results: Element[] = [];
  const seen = new Set<Element>();
  
  for (const selector of selectors) {
    try {
      if (selector.includes(':contains(')) {
        const match = selector.match(/(.+):contains\("(.+)"\)/);
        if (match) {
          const [, baseSelector, text] = match;
          const elements = container.querySelectorAll(baseSelector);
          for (const el of elements) {
            if (el.textContent?.includes(text) && !seen.has(el)) {
              results.push(el);
              seen.add(el);
            }
          }
        }
        continue;
      }
      
      const elements = container.querySelectorAll(selector);
      for (const el of elements) {
        if (!seen.has(el)) {
          results.push(el);
          seen.add(el);
        }
      }
    } catch {
      // Invalid selector, skip
    }
  }
  
  return results;
}

/**
 * Extract text content from an element, cleaned up
 */
export function extractText(element: Element | null): string {
  if (!element) return '';
  return (element.textContent || '').trim().replace(/\s+/g, ' ');
}

/**
 * Detect difficulty from text or element classes
 */
export function detectDifficulty(element: Element | null): string | undefined {
  if (!element) return undefined;
  
  const text = extractText(element).toLowerCase();
  const classes = element.className.toLowerCase();
  
  // Check text content
  if (text.includes('easy')) return 'Easy';
  if (text.includes('medium')) return 'Medium';
  if (text.includes('hard')) return 'Hard';
  
  // Check class names
  if (classes.includes('green') || classes.includes('easy')) return 'Easy';
  if (classes.includes('yellow') || classes.includes('orange') || classes.includes('medium')) return 'Medium';
  if (classes.includes('red') || classes.includes('hard')) return 'Hard';
  
  return undefined;
}

/**
 * Check if element or its ancestors contain "accepted" text
 */
export function isAcceptedVerdict(element: Element): boolean {
  const text = extractText(element).toLowerCase();
  
  return (
    text.includes('accepted') ||
    text.includes('all test cases passed') ||
    text.includes('success') ||
    (text.includes('correct') && !text.includes('incorrect'))
  );
}
