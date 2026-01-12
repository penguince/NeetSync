// Progress file management for NeetSync

import type { Progress, Mapping, Settings } from './types';
import { GitHubClient } from './github';
import { logger } from './logger';
import { slugToTitle, normalizeCategory, normalizeListName } from './normalize';

/**
 * Generate PROGRESS.json content
 */
export function generateProgressJson(progress: Progress): string {
  return JSON.stringify(
    {
      updatedAt: Date.now(),
      solved: progress.solved,
    },
    null,
    2
  );
}

/**
 * Generate PROGRESS.md content
 */
export function generateProgressMd(
  progress: Progress,
  mapping: Mapping
): string {
  const lines: string[] = [];
  const solved = progress.solved;
  const slugs = Object.keys(solved);
  
  lines.push('# NeetSync Progress');
  lines.push('');
  lines.push(`> Last updated: ${new Date().toISOString()}`);
  lines.push(`> Total solved: ${slugs.length}`);
  lines.push('');
  
  // Recently solved section (last 20)
  const recentlySolved = slugs
    .map((slug) => ({ slug, ...solved[slug] }))
    .sort((a, b) => b.solvedAt - a.solvedAt)
    .slice(0, 20);
  
  if (recentlySolved.length > 0) {
    lines.push('## 🕐 Recently Solved');
    lines.push('');
    lines.push('| Problem | Difficulty | Language | Solved At |');
    lines.push('|---------|------------|----------|-----------|');
    
    for (const item of recentlySolved) {
      const title = item.title || slugToTitle(item.slug);
      const difficulty = item.difficulty || '-';
      const lang = item.language || '-';
      const date = new Date(item.solvedAt).toLocaleDateString();
      const url = `https://neetcode.io/problems/${item.slug}`;
      
      lines.push(`| [${title}](${url}) | ${difficulty} | ${lang} | ${date} |`);
    }
    lines.push('');
  }
  
  // Group by list if available
  const byList: Record<string, typeof recentlySolved> = {};
  const byCategory: Record<string, typeof recentlySolved> = {};
  const unsorted: typeof recentlySolved = [];
  
  for (const slug of slugs) {
    const solvedItem = { slug, ...solved[slug] };
    const mappingEntry = mapping.entries[slug];
    
    const listName = solvedItem.listName || mappingEntry?.listName;
    const category = solvedItem.category || mappingEntry?.category;
    
    if (listName) {
      const key = normalizeListName(listName);
      if (!byList[key]) byList[key] = [];
      byList[key].push(solvedItem);
    } else if (category) {
      const key = normalizeCategory(category);
      if (!byCategory[key]) byCategory[key] = [];
      byCategory[key].push(solvedItem);
    } else {
      unsorted.push(solvedItem);
    }
  }
  
  // Output by list
  const listNames = Object.keys(byList).sort();
  if (listNames.length > 0) {
    lines.push('## 📚 By List');
    lines.push('');
    
    for (const listName of listNames) {
      lines.push(`### ${listName}`);
      lines.push('');
      
      // Group by category within list
      const listItems = byList[listName];
      const categoryGroups: Record<string, typeof listItems> = {};
      
      for (const item of listItems) {
        const cat = item.category || mapping.entries[item.slug]?.category || 'Other';
        if (!categoryGroups[cat]) categoryGroups[cat] = [];
        categoryGroups[cat].push(item);
      }
      
      for (const [cat, items] of Object.entries(categoryGroups).sort((a, b) => a[0].localeCompare(b[0]))) {
        lines.push(`#### ${cat}`);
        lines.push('');
        
        for (const item of items.sort((a, b) => a.title.localeCompare(b.title))) {
          const diffBadge = getDifficultyBadge(item.difficulty);
          lines.push(`- [${item.title}](https://neetcode.io/problems/${item.slug}) ${diffBadge}`);
        }
        lines.push('');
      }
    }
  }
  
  // Output by category (if no list)
  const categoryNames = Object.keys(byCategory).sort();
  if (categoryNames.length > 0) {
    lines.push('## 📂 By Category');
    lines.push('');
    
    for (const categoryName of categoryNames) {
      lines.push(`### ${categoryName}`);
      lines.push('');
      
      for (const item of byCategory[categoryName].sort((a, b) => a.title.localeCompare(b.title))) {
        const diffBadge = getDifficultyBadge(item.difficulty);
        lines.push(`- [${item.title}](https://neetcode.io/problems/${item.slug}) ${diffBadge}`);
      }
      lines.push('');
    }
  }
  
  // Output unsorted
  if (unsorted.length > 0) {
    lines.push('## 📋 Other Problems');
    lines.push('');
    
    for (const item of unsorted.sort((a, b) => a.title.localeCompare(b.title))) {
      const diffBadge = getDifficultyBadge(item.difficulty);
      lines.push(`- [${item.title}](https://neetcode.io/problems/${item.slug}) ${diffBadge}`);
    }
    lines.push('');
  }
  
  // Statistics
  lines.push('---');
  lines.push('');
  lines.push('## 📊 Statistics');
  lines.push('');
  
  const difficulties = { Easy: 0, Medium: 0, Hard: 0, Unknown: 0 };
  for (const slug of slugs) {
    const diff = solved[slug].difficulty?.toLowerCase();
    if (diff?.includes('easy')) difficulties.Easy++;
    else if (diff?.includes('medium')) difficulties.Medium++;
    else if (diff?.includes('hard')) difficulties.Hard++;
    else difficulties.Unknown++;
  }
  
  lines.push(`- 🟢 Easy: ${difficulties.Easy}`);
  lines.push(`- 🟡 Medium: ${difficulties.Medium}`);
  lines.push(`- 🔴 Hard: ${difficulties.Hard}`);
  if (difficulties.Unknown > 0) {
    lines.push(`- ⚪ Unknown: ${difficulties.Unknown}`);
  }
  lines.push('');
  
  lines.push('---');
  lines.push('*Generated by [NeetSync](https://github.com/neetsync)*');
  
  return lines.join('\n');
}

function getDifficultyBadge(difficulty?: string): string {
  if (!difficulty) return '';
  const lower = difficulty.toLowerCase();
  if (lower.includes('easy')) return '🟢';
  if (lower.includes('medium')) return '🟡';
  if (lower.includes('hard')) return '🔴';
  return '';
}

/**
 * Sync progress files to GitHub
 */
export async function syncProgressFiles(
  token: string,
  settings: Settings,
  progress: Progress,
  mapping: Mapping
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = new GitHubClient(token, settings.repoFullName);
    
    const jsonPath = `${settings.baseDir}/PROGRESS.json`;
    const mdPath = `${settings.baseDir}/PROGRESS.md`;
    
    const jsonContent = generateProgressJson(progress);
    const mdContent = generateProgressMd(progress, mapping);
    
    // Commit PROGRESS.json
    const existingJson = await client.getFile(jsonPath, settings.branch);
    await client.createOrUpdateFile(
      jsonPath,
      jsonContent,
      '📊 Update PROGRESS.json',
      settings.branch,
      existingJson?.sha
    );
    
    // Commit PROGRESS.md
    const existingMd = await client.getFile(mdPath, settings.branch);
    await client.createOrUpdateFile(
      mdPath,
      mdContent,
      '📊 Update PROGRESS.md',
      settings.branch,
      existingMd?.sha
    );
    
    await logger.success('Progress files synced to GitHub');
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await logger.error('Failed to sync progress files', message);
    return { success: false, error: message };
  }
}
