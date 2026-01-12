// GitHub API client for NeetSync

import type { GitHubFileResponse, GitHubCreateFileRequest } from './types';
import { logger } from './logger';

const GITHUB_API_BASE = 'https://api.github.com';

export class GitHubClient {
  private token: string;
  private owner: string;
  private repo: string;
  
  constructor(token: string, repoFullName: string) {
    this.token = token;
    const [owner, repo] = repoFullName.split('/');
    this.owner = owner;
    this.repo = repo;
  }
  
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${GITHUB_API_BASE}${path}`;
    
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `Bearer ${this.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };
    
    if (body) {
      headers['Content-Type'] = 'application/json';
    }
    
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API error ${response.status}: ${errorText}`);
    }
    
    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }
    
    return response.json();
  }
  
  /**
   * Get file contents and SHA
   */
  async getFile(path: string, branch: string): Promise<GitHubFileResponse | null> {
    try {
      const result = await this.request<GitHubFileResponse>(
        'GET',
        `/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`
      );
      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }
  
  /**
   * Create or update a file
   */
  async createOrUpdateFile(
    path: string,
    content: string,
    message: string,
    branch: string,
    existingSha?: string
  ): Promise<void> {
    // Get existing SHA if not provided
    let sha = existingSha;
    if (!sha) {
      const existing = await this.getFile(path, branch);
      sha = existing?.sha;
    }
    
    const body: GitHubCreateFileRequest = {
      message,
      content: btoa(unescape(encodeURIComponent(content))), // Base64 encode UTF-8
      branch,
    };
    
    if (sha) {
      body.sha = sha;
    }
    
    await this.request(
      'PUT',
      `/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(path)}`,
      body
    );
  }
  
  /**
   * Verify token and repo access
   */
  async verifyAccess(): Promise<{ valid: boolean; error?: string }> {
    try {
      await this.request('GET', `/repos/${this.owner}/${this.repo}`);
      return { valid: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { valid: false, error: message };
    }
  }
}

/**
 * Commit a solution file to GitHub with retry logic
 */
export async function commitSolutionFile(
  token: string,
  repoFullName: string,
  branch: string,
  filePath: string,
  content: string,
  commitMessage: string,
  overwrite: boolean = true
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = new GitHubClient(token, repoFullName);
    
    // Check if file exists
    const existing = await client.getFile(filePath, branch);
    
    if (existing && !overwrite) {
      await logger.info(`File already exists, skipping: ${filePath}`);
      return { success: true };
    }
    
    await client.createOrUpdateFile(
      filePath,
      content,
      commitMessage,
      branch,
      existing?.sha
    );
    
    await logger.success(`Committed: ${filePath}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await logger.error(`Failed to commit ${filePath}`, message);
    return { success: false, error: message };
  }
}
