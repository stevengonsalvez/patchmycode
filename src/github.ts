import { Context } from 'probot';
import { RestEndpointMethods } from '@octokit/plugin-rest-endpoint-methods/dist-types/generated/method-types';

export interface CreatePullRequestParams {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
  draft?: boolean;
  maintainer_can_modify?: boolean;
}

export interface IssueDetails {
  owner: string;
  repo: string;
  issue_number: number;
  title: string;
  body: string;
  labels: string[];
  user: {
    login: string;
    id: number;
  };
}

export class GitHubClient {
  private context: Context;
  private rateLimitRemaining: number = 5000;
  private rateLimitResetTime: number = 0;

  constructor(context: Context) {
    this.context = context;
    
    // Set up rate limit handling
    this.context.octokit.hook.after('request', (response) => {
      if (response.headers && response.headers['x-ratelimit-remaining']) {
        this.rateLimitRemaining = parseInt(response.headers['x-ratelimit-remaining'] as string, 10);
      }
      if (response.headers && response.headers['x-ratelimit-reset']) {
        this.rateLimitResetTime = parseInt(response.headers['x-ratelimit-reset'] as string, 10);
      }
    });
  }

  /**
   * Get the repository owner and name from the context
   * @returns { owner, repo }
   */
  getRepoInfo() {
    const { owner, repo } = this.context.repo();
    return { owner, repo };
  }

  /**
   * Get the issue details from the context
   * @returns Issue details
   */
  getIssueDetails(): IssueDetails {
    const { owner, repo } = this.getRepoInfo();
    const issue = this.context.payload.issue;
    
    if (!issue) {
      throw new Error('No issue found in context');
    }
    
    return {
      owner,
      repo,
      issue_number: issue.number,
      title: issue.title,
      body: issue.body || '',
      labels: issue.labels?.map((label: any) => label.name || '') || [],
      user: {
        login: issue.user.login,
        id: issue.user.id
      }
    };
  }

  /**
   * Check if an issue has a specific label
   * @param labelName The label name to check for
   * @returns Boolean indicating if the issue has the label
   */
  hasIssueLabel(labelName: string): boolean {
    try {
      const details = this.getIssueDetails();
      return details.labels.includes(labelName);
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if an issue has any of the specified labels
   * @param labelNames Array of label names to check for
   * @returns Boolean indicating if the issue has any of the labels
   */
  hasAnyIssueLabel(labelNames: string[]): boolean {
    try {
      const details = this.getIssueDetails();
      return labelNames.some(label => details.labels.includes(label));
    } catch (error) {
      return false;
    }
  }

  /**
   * Check the current rate limit status
   * @returns Object with rate limit information
   */
  async checkRateLimit() {
    const { data } = await this.context.octokit.rateLimit.get();
    return data.resources.core;
  }

  /**
   * Wait if rate limit is close to being exceeded
   */
  async waitForRateLimit() {
    if (this.rateLimitRemaining < 10) {
      const now = Math.floor(Date.now() / 1000);
      const waitTime = (this.rateLimitResetTime - now) * 1000 + 1000; // Add 1 second buffer
      
      if (waitTime > 0) {
        console.log(`Rate limit almost exceeded. Waiting for ${waitTime / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  /**
   * Add a comment to an issue
   * @param body The comment body
   * @returns The created comment
   */
  async addIssueComment(body: string) {
    await this.waitForRateLimit();
    const issueComment = this.context.issue({ body });
    try {
      return await this.context.octokit.issues.createComment(issueComment);
    } catch (error) {
      console.error(`Error adding issue comment: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Create a pull request
   * @param params Pull request parameters
   * @returns The created pull request
   */
  async createPullRequest(params: CreatePullRequestParams) {
    await this.waitForRateLimit();
    try {
      return await this.context.octokit.pulls.create(params);
    } catch (error) {
      console.error(`Error creating pull request: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Add labels to a pull request
   * @param prNumber The pull request number
   * @param labels Array of labels to add
   * @returns Response from the API
   */
  async addLabelsToPullRequest(prNumber: number, labels: string[]) {
    if (!labels || labels.length === 0) return;
    
    await this.waitForRateLimit();
    const { owner, repo } = this.getRepoInfo();
    try {
      return await this.context.octokit.issues.addLabels({
        owner,
        repo,
        issue_number: prNumber,
        labels
      });
    } catch (error) {
      console.error(`Error adding labels to PR: ${error instanceof Error ? error.message : String(error)}`);
      // Non-fatal error, continue execution
    }
  }

  /**
   * Get the repository's default branch
   * @returns The default branch name
   */
  async getDefaultBranch() {
    await this.waitForRateLimit();
    const { owner, repo } = this.getRepoInfo();
    try {
      const { data: repository } = await this.context.octokit.repos.get({
        owner,
        repo,
      });
      
      return repository.default_branch;
    } catch (error) {
      console.error(`Error getting default branch: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get the clone URL for the repository
   * @returns The repository clone URL
   */
  async getRepositoryCloneUrl() {
    await this.waitForRateLimit();
    const { owner, repo } = this.getRepoInfo();
    try {
      const { data: repository } = await this.context.octokit.repos.get({
        owner,
        repo,
      });
      
      return repository.clone_url;
    } catch (error) {
      console.error(`Error getting repository clone URL: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Generate a temporary access token for Git operations
   * @returns A temporary GitHub token
   */
  async getInstallationToken(): Promise<string> {
    await this.waitForRateLimit();
    try {
      const { data } = await this.context.octokit.apps.createInstallationAccessToken({
        installation_id: this.context.payload.installation.id,
      });
      return data.token;
    } catch (error) {
      console.error(`Error getting installation token: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Check if a branch exists in the repository
   * @param branchName Name of the branch to check
   * @returns Boolean indicating if the branch exists
   */
  async branchExists(branchName: string): Promise<boolean> {
    await this.waitForRateLimit();
    const { owner, repo } = this.getRepoInfo();
    try {
      await this.context.octokit.repos.getBranch({
        owner,
        repo,
        branch: branchName,
      });
      return true;
    } catch (error) {
      // If the branch doesn't exist, the API returns a 404 error
      return false;
    }
  }

  /**
   * Update the status of an issue
   * @param state New state for the issue ('open' or 'closed')
   * @returns Response from the API
   */
  async updateIssueState(state: 'open' | 'closed') {
    await this.waitForRateLimit();
    const { owner, repo } = this.getRepoInfo();
    const issue = this.getIssueDetails();
    try {
      return await this.context.octokit.issues.update({
        owner,
        repo,
        issue_number: issue.issue_number,
        state
      });
    } catch (error) {
      console.error(`Error updating issue state: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Check if a repository is private
   * @returns Boolean indicating if the repository is private
   */
  async isPrivateRepository(): Promise<boolean> {
    await this.waitForRateLimit();
    const { owner, repo } = this.getRepoInfo();
    try {
      const { data } = await this.context.octokit.repos.get({
        owner,
        repo,
      });
      return data.private;
    } catch (error) {
      console.error(`Error checking if repository is private: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Add a reaction to an issue or comment
   * @param content The reaction content
   * @param commentId Optional comment ID (if reacting to a comment)
   * @returns Response from the API
   */
  async addReaction(content: '+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket' | 'eyes', commentId?: number) {
    await this.waitForRateLimit();
    const { owner, repo } = this.getRepoInfo();
    const issue = this.getIssueDetails();
    
    try {
      if (commentId) {
        return await this.context.octokit.reactions.createForIssueComment({
          owner,
          repo,
          comment_id: commentId,
          content,
        });
      } else {
        return await this.context.octokit.reactions.createForIssue({
          owner,
          repo,
          issue_number: issue.issue_number,
          content,
        });
      }
    } catch (error) {
      console.error(`Error adding reaction: ${error instanceof Error ? error.message : String(error)}`);
      // Non-fatal error, continue execution
    }
  }
}
