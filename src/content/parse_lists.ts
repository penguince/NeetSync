// Parse problem lists from NeetCode pages

import { LIST_SELECTORS, findAllElements, extractText, detectDifficulty } from './dom_selectors';

export interface ParsedProblem {
  slug: string;
  title?: string;
  category?: string;
  listName?: string;
  difficulty?: string;
}

/**
 * Check if the current page looks like a list page
 */
export function isListPage(): boolean {
  const problemLinks = document.querySelectorAll('a[href*="/problems/"]');
  return problemLinks.length >= 5;
}

/**
 * Get the list name from the page header
 */
export function getListName(): string | undefined {
  const listNamePatterns = [
    /neetcode\s*150/i,
    /neetcode\s*250/i,
    /blind\s*75/i,
    /roadmap/i,
    /all\s*problems/i,
  ];
  
  // Check URL first
  const url = window.location.href.toLowerCase();
  if (url.includes('neetcode-150')) return 'NeetCode 150';
  if (url.includes('neetcode-250')) return 'NeetCode 250';
  if (url.includes('blind-75')) return 'Blind 75';
  if (url.includes('roadmap')) {
    // Try to get specific roadmap name
    const pathMatch = window.location.pathname.match(/roadmap\/([^\/]+)/);
    if (pathMatch) {
      return `Roadmap: ${pathMatch[1].replace(/-/g, ' ')}`;
    }
    return 'Roadmap';
  }
  
  // Check page title/headers
  const headers = findAllElements(LIST_SELECTORS.listTitle);
  for (const header of headers) {
    const text = extractText(header);
    for (const pattern of listNamePatterns) {
      if (pattern.test(text)) {
        return text.substring(0, 50); // Limit length
      }
    }
  }
  
  return undefined;
}

/**
 * Find the nearest category heading for an element
 */
function findNearestCategory(element: Element): string | undefined {
  // Strategy 1: Walk up to find a parent section with heading
  let parent = element.parentElement;
  let depth = 0;
  
  while (parent && depth < 10) {
    // Check for category headers in siblings
    const heading = parent.querySelector('h2, h3, [class*="category"], [class*="section-title"]');
    if (heading && heading !== element) {
      const text = extractText(heading);
      if (text && text.length > 0 && text.length < 50) {
        // Filter out generic headers
        const lower = text.toLowerCase();
        if (!lower.includes('problem') && !lower.includes('solved') && !lower.includes('status')) {
          return text;
        }
      }
    }
    
    // Check for data attributes
    const category = parent.getAttribute('data-category') || 
                    parent.getAttribute('data-section');
    if (category) {
      return category;
    }
    
    parent = parent.parentElement;
    depth++;
  }
  
  // Strategy 2: Look for previous siblings that are headings
  let sibling = element.previousElementSibling;
  depth = 0;
  
  while (sibling && depth < 20) {
    const tagName = sibling.tagName.toLowerCase();
    if (tagName === 'h2' || tagName === 'h3') {
      const text = extractText(sibling);
      if (text && text.length > 0 && text.length < 50) {
        return text;
      }
    }
    sibling = sibling.previousElementSibling;
    depth++;
  }
  
  return undefined;
}

/**
 * Extract problem slug from URL
 */
function extractSlug(href: string): string | null {
  const match = href.match(/\/problems\/([^\/\?#]+)/);
  return match ? match[1] : null;
}

/**
 * Parse all problems from the current page
 */
export function parseProblems(): ParsedProblem[] {
  const problems: ParsedProblem[] = [];
  const seen = new Set<string>();
  
  const listName = getListName();
  
  // Find all problem links
  const links = document.querySelectorAll('a[href*="/problems/"]');
  
  for (const link of links) {
    const href = link.getAttribute('href');
    if (!href) continue;
    
    const slug = extractSlug(href);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    
    // Extract title
    let title = extractText(link);
    
    // If link text is empty or too short, try adjacent elements
    if (!title || title.length < 2) {
      const parent = link.parentElement;
      if (parent) {
        const titleEl = parent.querySelector('[class*="title"], span, p');
        if (titleEl) {
          title = extractText(titleEl);
        }
      }
    }
    
    // Clean up title (remove number prefixes like "1. Two Sum")
    title = title.replace(/^\d+\.\s*/, '');
    
    // Find category
    const category = findNearestCategory(link);
    
    // Find difficulty
    let difficulty: string | undefined;
    
    // Check parent row for difficulty badge
    const row = link.closest('tr, [class*="row"], [class*="item"], .flex');
    if (row) {
      const diffElements = findAllElements(LIST_SELECTORS.difficultyInList, row);
      for (const el of diffElements) {
        difficulty = detectDifficulty(el);
        if (difficulty) break;
      }
    }
    
    problems.push({
      slug,
      title: title || undefined,
      category,
      listName,
      difficulty,
    });
  }
  
  return problems;
}

/**
 * Convert parsed problems to mapping entries
 */
export function problemsToMappingEntries(
  problems: ParsedProblem[],
  sourceUrl: string
): Record<string, { title?: string; category?: string; listName?: string; difficulty?: string; sourceUrl: string }> {
  const entries: Record<string, { title?: string; category?: string; listName?: string; difficulty?: string; sourceUrl: string }> = {};
  
  for (const problem of problems) {
    entries[problem.slug] = {
      title: problem.title,
      category: problem.category,
      listName: problem.listName,
      difficulty: problem.difficulty,
      sourceUrl,
    };
  }
  
  return entries;
}
