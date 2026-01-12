// Type definitions for NeetSync

export type OrganizationMode = 'AUTO' | 'DIFFICULTY' | 'FLAT' | 'CATEGORY';

export interface Settings {
  repoFullName: string;
  branch: string;
  baseDir: string;
  organizationMode: OrganizationMode;
  overwrite: boolean;
  includeHeader: boolean;
  includeDifficultyFolder: boolean;
  includeListFolderWhenKnown: boolean;
  filenameIncludeSlug: boolean;
  debugMode: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  repoFullName: '',
  branch: 'main',
  baseDir: 'NeetSync',
  organizationMode: 'AUTO',
  overwrite: true,
  includeHeader: true,
  includeDifficultyFolder: false,
  includeListFolderWhenKnown: true,
  filenameIncludeSlug: false,
  debugMode: false,
};

export interface MappingEntry {
  title?: string;
  category?: string;
  listName?: string;
  difficulty?: string;
  sources?: string[];
}

export interface Mapping {
  version: number;
  updatedAt: number;
  entries: Record<string, MappingEntry>;
}

export interface SolvedEntry {
  title: string;
  category?: string;
  listName?: string;
  difficulty?: string;
  language: string;
  solvedAt: number;
  sha256?: string;
}

export interface Progress {
  solved: Record<string, SolvedEntry>;
}

export interface QueueItem {
  id: string;
  slug: string;
  title: string;
  category?: string;
  listName?: string;
  difficulty?: string;
  language: string;
  code: string;
  meta?: { runtime?: string; memory?: string };
  source: 'dom' | 'intercept';
  at: number;
  retries: number;
  lastAttempt?: number;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  details?: string;
}

export interface SyncState {
  settings: Settings;
  mapping: Mapping;
  progress: Progress;
  queue: QueueItem[];
  logs: LogEntry[];
  lastSync?: number;
  isProcessing: boolean;
}

// Message types
export interface SubmissionPayload {
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

export interface MappingMergePayload {
  entries: Record<string, Omit<MappingEntry, 'sources'> & { sourceUrl: string }>;
  updatedAt: number;
}

export type MessageType =
  | { type: 'NEETSYNC_SUBMISSION_ACCEPTED'; payload: SubmissionPayload }
  | { type: 'NEETSYNC_MAPPING_MERGE'; payload: MappingMergePayload }
  | { type: 'NEETSYNC_SAVE_SETTINGS'; payload: Partial<Settings> }
  | { type: 'NEETSYNC_SAVE_TOKEN'; payload: { token: string } }
  | { type: 'NEETSYNC_REFRESH_MAPPING_FROM_ACTIVE_TAB' }
  | { type: 'NEETSYNC_SYNC_PROGRESS_NOW' }
  | { type: 'NEETSYNC_GET_STATE' }
  | { type: 'NEETSYNC_CLEAR_LOGS' }
  | { type: 'NEETSYNC_PROCESS_QUEUE' }
  | { type: 'NEETSYNC_REQUEST_CATALOG_PARSE' };

export interface GitHubFileResponse {
  sha: string;
  content?: string;
}

export interface GitHubCreateFileRequest {
  message: string;
  content: string;
  branch?: string;
  sha?: string;
}

// Language extension mapping
export const LANGUAGE_EXTENSIONS: Record<string, string> = {
  'python': 'py',
  'python3': 'py',
  'javascript': 'js',
  'typescript': 'ts',
  'java': 'java',
  'cpp': 'cpp',
  'c++': 'cpp',
  'c': 'c',
  'csharp': 'cs',
  'c#': 'cs',
  'go': 'go',
  'golang': 'go',
  'rust': 'rs',
  'swift': 'swift',
  'kotlin': 'kt',
  'scala': 'scala',
  'ruby': 'rb',
  'php': 'php',
  'dart': 'dart',
  'racket': 'rkt',
  'elixir': 'ex',
  'erlang': 'erl',
};

export function getExtension(language: string): string {
  const normalized = language.toLowerCase().trim();
  return LANGUAGE_EXTENSIONS[normalized] || 'txt';
}
