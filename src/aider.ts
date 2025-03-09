import { execa } from 'execa';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as process from 'process';

export interface AiderResult {
  success: boolean;
  changes: string[];
  message: string;
}

export interface AiderOptions {
  timeout?: number;
  openAiApiKey?: string;
  anthropicApiKey?: string;
  model?: string;
  extraArgs?: string[];
}

export class AiderClient {
  private workingDir: string | null = null;
  private options: AiderOptions;
  private isAiderInstalled: boolean = false;

  constructor(options: AiderOptions = {}) {
    this.options = {
      timeout: options.timeout || 300000, // 5 minutes default
      model: options.model || 'gpt-4o',
      extraArgs: options.extraArgs || [],
      openAiApiKey: options.openAiApiKey || process.env.OPENAI_API_KEY,
      anthropicApiKey: options.anthropicApiKey || process.env.ANTHROPIC_API_KEY
    };
  }

  /**
   * Initialize Aider client with a temporary working directory and check if Aider is installed
   */
  async init(): Promise<void> {
    // Create a temporary directory for Aider to work in
    this.workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aider-'));
    
    // Check if Aider is installed
    try {
      await execa('aider', ['--version']);
      this.isAiderInstalled = true;
      console.log('Aider is installed');
    } catch (error) {
      console.log('Aider is not installed. Will attempt to install it.');
      await this.installAider();
    }
  }

  /**
   * Install Aider using pip if it's not already installed
   */
  private async installAider(): Promise<void> {
    try {
      console.log('Installing Aider...');
      await execa('pip', ['install', 'aider-chat']);
      
      // Verify installation
      await execa('aider', ['--version']);
      this.isAiderInstalled = true;
      console.log('Successfully installed Aider');
    } catch (error) {
      console.error('Failed to install Aider:', error);
      throw new Error('Failed to install Aider. Please install it manually with: pip install aider-chat');
    }
  }

  /**
   * Run Aider to fix an issue based on the issue description and code repository
   * 
   * @param repoUrl The GitHub repository URL
   * @param issueTitle The issue title
   * @param issueBody The issue body/description
   * @param branchName Name of the branch to create
   * @param authToken Optional GitHub auth token for private repositories
   * @returns Result of the Aider operation
   */
  async fixIssue(
    repoUrl: string,
    issueTitle: string,
    issueBody: string,
    branchName: string,
    authToken?: string
  ): Promise<AiderResult> {
    if (!this.workingDir) {
      throw new Error('Aider client not initialized. Call init() first.');
    }

    if (!this.isAiderInstalled) {
      throw new Error('Aider is not installed and installation failed.');
    }

    try {
      // Prepare auth for private repositories if token is provided
      let authenticatedRepoUrl = repoUrl;
      if (authToken) {
        // Insert auth token into the URL
        const url = new URL(repoUrl);
        authenticatedRepoUrl = repoUrl.replace(`${url.protocol}//`, `${url.protocol}//${authToken}@`);
      }

      // Clone the repository
      console.log(`Cloning repository: ${repoUrl} to ${this.workingDir}`);
      await execa('git', ['clone', authenticatedRepoUrl, this.workingDir]);
      
      // Configure Git for commits
      await execa('git', ['config', 'user.name', 'Aider Bot'], { cwd: this.workingDir });
      await execa('git', ['config', 'user.email', 'aider-bot@noreply.github.com'], { cwd: this.workingDir });
      
      // Create a new branch
      console.log(`Creating branch: ${branchName}`);
      await execa('git', ['checkout', '-b', branchName], { cwd: this.workingDir });
      
      // Create a file with the issue description for Aider to read
      const issueFile = path.join(this.workingDir, 'ISSUE.md');
      await fs.writeFile(issueFile, `# ${issueTitle}\n\n${issueBody}`);
      
      // Build Aider command with all options
      const aiderArgs = [
        '--yes',
        '--no-input',
        '--message', `Fix: ${issueTitle}`,
      ];

      // Add model if specified
      if (this.options.model) {
        aiderArgs.push('--model', this.options.model);
      }
      
      // Add extra arguments if specified
      if (this.options.extraArgs && this.options.extraArgs.length > 0) {
        aiderArgs.push(...this.options.extraArgs);
      }
      
      // Add the issue file as the last argument
      aiderArgs.push(issueFile);
      
      console.log(`Running Aider with arguments: ${aiderArgs.join(' ')}`);
      
      // Set environment variables for API keys if provided
      const env = { ...process.env };
      if (this.options.openAiApiKey) {
        env.OPENAI_API_KEY = this.options.openAiApiKey;
      }
      if (this.options.anthropicApiKey) {
        env.ANTHROPIC_API_KEY = this.options.anthropicApiKey;
      }
      
      // Run Aider with the issue file
      const { stdout, stderr } = await execa('aider', aiderArgs, {
        cwd: this.workingDir,
        timeout: this.options.timeout,
        env
      });
      
      // Log Aider output for debugging
      console.log('Aider stdout:', stdout);
      if (stderr) console.error('Aider stderr:', stderr);
      
      // Check if Aider made any changes
      const gitStatus = await execa('git', ['status', '--porcelain'], { cwd: this.workingDir });
      const hasChanges = gitStatus.stdout.trim().length > 0;
      
      if (hasChanges) {
        // Get the list of changed files
        const changedFiles = gitStatus.stdout
          .split('\n')
          .filter(Boolean)
          .map(line => line.substring(3));
        
        console.log(`Changes detected in ${changedFiles.length} files:`, changedFiles);
        
        // Commit the changes
        await execa('git', ['add', '.'], { cwd: this.workingDir });
        await execa('git', ['commit', '-m', `Fix: ${issueTitle}`], { cwd: this.workingDir });
        
        // Configure push URL with auth if needed
        if (authToken) {
          const url = new URL(repoUrl);
          const authenticatedPushUrl = repoUrl.replace(`${url.protocol}//`, `${url.protocol}//${authToken}@`);
          await execa('git', ['remote', 'set-url', 'origin', authenticatedPushUrl], { cwd: this.workingDir });
        }
        
        // Push the changes
        console.log(`Pushing changes to branch: ${branchName}`);
        await execa('git', ['push', 'origin', branchName], { cwd: this.workingDir });
        
        return {
          success: true,
          changes: changedFiles,
          message: 'Successfully applied fixes'
        };
      } else {
        console.log('No changes were made by Aider');
        return {
          success: false,
          changes: [],
          message: 'Aider did not make any changes to the codebase'
        };
      }
    } catch (error) {
      console.error('Error running Aider:', error);
      
      // Try to get additional information from the error
      let errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check for specific error types
      if (errorMessage.includes('OPENAI_API_KEY')) {
        errorMessage = 'OpenAI API key is missing or invalid. Please set the OPENAI_API_KEY environment variable.';
      } else if (errorMessage.includes('ANTHROPIC_API_KEY')) {
        errorMessage = 'Anthropic API key is missing or invalid. Please set the ANTHROPIC_API_KEY environment variable.';
      } else if (errorMessage.includes('ENOENT') && errorMessage.includes('aider')) {
        errorMessage = 'Aider executable not found. Please install Aider with: pip install aider-chat';
      } else if (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('timeout')) {
        errorMessage = `Aider operation timed out after ${this.options.timeout ? this.options.timeout / 1000 : 300} seconds`;
      }
      
      return {
        success: false,
        changes: [],
        message: `Error running Aider: ${errorMessage}`
      };
    } finally {
      // Clean up
      await this.cleanup();
    }
  }

  /**
   * Clean up temporary directory
   */
  async cleanup(): Promise<void> {
    if (this.workingDir) {
      try {
        console.log(`Cleaning up temporary directory: ${this.workingDir}`);
        await fs.rm(this.workingDir, { recursive: true, force: true });
        this.workingDir = null;
      } catch (error) {
        console.error('Error cleaning up Aider working directory:', error);
      }
    }
  }
}
