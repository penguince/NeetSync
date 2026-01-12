// Path normalization and organization for NeetSync

import type { Settings, MappingEntry } from './types';
import { getExtension } from './types';

/**
 * Sanitize a string for use in file/folder names
 */
export function sanitize(str: string): string {
  return str
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid chars
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_+/g, '_') // Collapse multiple underscores
    .replace(/^_|_$/g, '') // Trim underscores
    .substring(0, 100); // Limit length
}

/**
 * Convert slug to Title Case
 */
export function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Normalize category name
 */
export function normalizeCategory(category: string): string {
  return sanitize(category.replace(/&/g, 'And').trim());
}

/**
 * Normalize list name
 */
export function normalizeListName(listName: string): string {
  return sanitize(listName.replace(/&/g, 'And').trim());
}

/**
 * Normalize difficulty
 */
export function normalizeDifficulty(difficulty?: string): string | undefined {
  if (!difficulty) return undefined;
  const lower = difficulty.toLowerCase().trim();
  if (lower.includes('easy')) return 'Easy';
  if (lower.includes('medium')) return 'Medium';
  if (lower.includes('hard')) return 'Hard';
  return undefined;
}

/**
 * Build the file path based on settings and available metadata
 */
export function buildFilePath(
  settings: Settings,
  slug: string,
  title: string,
  language: string,
  mappingEntry?: MappingEntry,
  difficulty?: string
): string {
  const parts: string[] = [settings.baseDir];
  
  const category = mappingEntry?.category;
  const listName = mappingEntry?.listName;
  const difficultyNorm = normalizeDifficulty(difficulty || mappingEntry?.difficulty);
  
  switch (settings.organizationMode) {
    case 'AUTO':
      // Most feature-rich organization
      if (settings.includeListFolderWhenKnown && listName) {
        parts.push(normalizeListName(listName));
      } else {
        parts.push('Problems');
      }
      
      if (settings.includeDifficultyFolder && difficultyNorm) {
        parts.push(difficultyNorm);
      }
      
      if (category) {
        parts.push(normalizeCategory(category));
      } else {
        parts.push('Unsorted');
      }
      break;
      
    case 'CATEGORY':
      parts.push('Problems');
      if (category) {
        parts.push(normalizeCategory(category));
      } else {
        parts.push('Unsorted');
      }
      break;
      
    case 'DIFFICULTY':
      parts.push('Problems');
      parts.push(difficultyNorm || 'Unknown_Difficulty');
      break;
      
    case 'FLAT':
      parts.push('Problems');
      break;
  }
  
  // Build filename
  const ext = getExtension(language);
  const sanitizedTitle = sanitize(title || slugToTitle(slug));
  
  let filename: string;
  if (settings.filenameIncludeSlug) {
    filename = `${slug}__${sanitizedTitle}.${ext}`;
  } else {
    filename = `${sanitizedTitle}.${ext}`;
  }
  
  parts.push(filename);
  
  return parts.join('/');
}

/**
 * Generate metadata header for code file
 */
export function generateHeader(
  slug: string,
  title: string,
  difficulty?: string,
  category?: string,
  listName?: string,
  language?: string,
  runtime?: string,
  memory?: string,
  solvedAt?: number
): string {
  const lines: string[] = [];
  const commentStyle = getCommentStyle(language || 'unknown');
  
  lines.push(commentStyle.start);
  lines.push(`${commentStyle.line} Problem: ${title}`);
  lines.push(`${commentStyle.line} Slug: ${slug}`);
  lines.push(`${commentStyle.line} URL: https://neetcode.io/problems/${slug}`);
  
  if (difficulty) {
    lines.push(`${commentStyle.line} Difficulty: ${difficulty}`);
  }
  if (category) {
    lines.push(`${commentStyle.line} Category: ${category}`);
  }
  if (listName) {
    lines.push(`${commentStyle.line} List: ${listName}`);
  }
  if (runtime) {
    lines.push(`${commentStyle.line} Runtime: ${runtime}`);
  }
  if (memory) {
    lines.push(`${commentStyle.line} Memory: ${memory}`);
  }
  if (solvedAt) {
    lines.push(`${commentStyle.line} Solved: ${new Date(solvedAt).toISOString()}`);
  }
  
  lines.push(commentStyle.end);
  lines.push('');
  
  return lines.filter(Boolean).join('\n');
}

interface CommentStyle {
  start: string;
  line: string;
  end: string;
}

function getCommentStyle(language: string): CommentStyle {
  const lower = language.toLowerCase();
  
  // Languages with /* */ style
  if (['java', 'javascript', 'typescript', 'cpp', 'c++', 'c', 'csharp', 'c#', 'go', 'golang', 'rust', 'swift', 'kotlin', 'scala', 'dart', 'php'].some(l => lower.includes(l))) {
    return { start: '/*', line: ' *', end: ' */' };
  }
  
  // Languages with # style
  if (['python', 'python3', 'ruby', 'elixir', 'perl'].some(l => lower.includes(l))) {
    return { start: '#', line: '#', end: '#' };
  }
  
  // Languages with ; style
  if (['racket', 'lisp', 'scheme'].some(l => lower.includes(l))) {
    return { start: ';', line: ';', end: ';' };
  }
  
  // Languages with % style
  if (['erlang'].some(l => lower.includes(l))) {
    return { start: '%', line: '%', end: '%' };
  }
  
  // Default to //
  return { start: '//', line: '//', end: '//' };
}

/**
 * Generate SHA256 hash for deduplication
 */
export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
