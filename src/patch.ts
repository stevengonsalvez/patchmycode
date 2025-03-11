import { execa } from 'execa';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as process from 'process';

export interface PatchResult {
  success: boolean;
  changes: string[];
  message: string;
}

export interface PatchOptions {
  timeout?: number;
  openAiApiKey?: string;
  anthropicApiKey?: string;
  model?: string;
  extraArgs?: string[];
}

export class PatchClient {
  private workingDir: string | null = null;
  private options: PatchOptions;
  private isAiderInstalled: boolean = false;

  constructor(options: PatchOptions = {}) {
    this.options = {
      timeout: options.timeout || 300000, // 5 minutes default
      model: options.model || 'gpt-4o',
      extraArgs: options.extraArgs || [],
      openAiApiKey: options.openAiApiKey || process.env.OPENAI_API_KEY,
      anthropicApiKey: options.anthropicApiKey || process.env.ANTHROPIC_API_KEY
    };
  }

  /**
   * Check if the configured model is a Claude/Anthropic model
   */
  private isClaudeModel(): boolean {
    return !!this.options.model && (
      this.options.model.toLowerCase().includes('claude') || 
      this.options.model.toLowerCase().includes('anthropic')
    );
  }

  /**
   * Initialize Aider client with a temporary working directory and check if Aider is installed
   */
  async init(): Promise<void> {
    // Create a temporary directory for Aider to work in
    this.workingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aider-'));
    
    // Check if Aider is installed and get version
    try {
      const { stdout } = await execa('aider', ['--version']);
      this.isAiderInstalled = true;
      console.log(`Aider is installed: ${stdout.trim()}`);
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
  ): Promise<PatchResult> {
    if (!this.workingDir) {
      throw new Error('Aider client not initialized. Call init() first.');
    }

    if (!this.isAiderInstalled) {
      throw new Error('Aider is not installed and installation failed.');
    }

    try {
      // Diagnostic logging for tokens (without exposing the token)
      if (authToken) {
        console.log(`Auth token provided: ${authToken.substring(0, 4)}...${authToken.substring(authToken.length - 4)} (${authToken.length} chars)`);
        console.log(`Token type: ${this.identifyTokenType(authToken)}`);
      } else {
        console.log('No auth token provided for repository access');
      }

      // Prepare auth for private repositories if token is provided
      let authenticatedRepoUrl = repoUrl;
      if (authToken) {
        // Validate token format
        if (!this.isValidGitHubToken(authToken)) {
          console.warn('Warning: Token format does not match standard GitHub token patterns');
        }
        
        // Use token for authentication but handle differently based on URL format
        const url = new URL(repoUrl);
        
        // GitHub-specific handling with multiple auth methods
        if (url.hostname === 'github.com') {
          // Determine the correct authentication format based on token type
          const tokenType = this.identifyTokenType(authToken);
          
          // Create authentication URLs in order of preference
          const authUrls: string[] = [];
          
          if (tokenType === 'GitHub App Installation Token') {
            // For GitHub App installation tokens (ghs_*), x-access-token is preferred
            authUrls.push(`https://x-access-token:${authToken}@github.com${url.pathname}`);
            authUrls.push(`https://${authToken}@github.com${url.pathname}`);
          } else if (tokenType === 'OAuth App Token') {
            // For OAuth tokens, oauth2: prefix is preferred
            authUrls.push(`https://oauth2:${authToken}@github.com${url.pathname}`);
            authUrls.push(`https://${authToken}@github.com${url.pathname}`);
          } else {
            // For PATs and unknown tokens, try multiple formats
            authUrls.push(`https://${authToken}@github.com${url.pathname}`);
            authUrls.push(`https://x-access-token:${authToken}@github.com${url.pathname}`);
            authUrls.push(`https://oauth2:${authToken}@github.com${url.pathname}`);
          }
          
          console.log('Prepared multiple authentication methods for GitHub');
          
          // Try multiple authentication methods in sequence
          let cloned = false;
          let lastError: Error | null = null;
          
          for (const authUrl of authUrls) {
            try {
              console.log('Attempting GitHub repository clone...');
              await this.attemptRepositoryClone(authUrl, this.workingDir);
              cloned = true;
              console.log('Authentication method succeeded');
              break;
            } catch (cloneError) {
              const errorMessage = cloneError instanceof Error ? cloneError.message : String(cloneError);
              lastError = cloneError instanceof Error ? cloneError : new Error(String(cloneError));
              console.log(`Authentication method failed: ${this.sanitizeErrorMessage(errorMessage)}`);
            }
          }
          
          // If all methods failed, throw the last error
          if (!cloned) {
            if (lastError) {
              throw lastError;
            }
            throw new Error('All authentication methods failed. Please verify the token has the "contents: read" permission.');
          }
        } else {
          // For other Git providers, use their URL structure
          authenticatedRepoUrl = repoUrl.replace(`${url.protocol}//`, `${url.protocol}//${authToken}@`);
          await this.attemptRepositoryClone(authenticatedRepoUrl, this.workingDir);
        }
      } else {
        // No auth token provided - try public access
        console.log('Attempting to clone repository without authentication');
        await this.attemptRepositoryClone(repoUrl, this.workingDir);
      }
      
      // Configure Git for commits
      await execa('git', ['config', 'user.name', 'patchmycode'], { cwd: this.workingDir });
      await execa('git', ['config', 'user.email', 'patchmycode-bot@noreply.github.com'], { cwd: this.workingDir });
      
      // Create a new branch
      console.log(`Creating branch: ${branchName}`);
      await execa('git', ['checkout', '-b', branchName], { cwd: this.workingDir });
      
      // Create a file with the issue description for Aider to read
      const issueFile = path.join(this.workingDir, 'ISSUE.md');
      await fs.writeFile(issueFile, `# ${issueTitle}\n\n${issueBody}`);
      
      // Build Aider command with all options
      const aiderArgs = [
        '--yes-always', // Use --yes-always instead of --yes and --no-input
        '--message', `Fix: ${issueTitle}`,
      ];
      
      // Try all possible flag variations for Claude models
      if (this.isClaudeModel()) {
        console.log('Using Anthropic/Claude model');
        
        // Check if any Claude flag is already present in extra args
        const hasClaudeFlag = this.options.extraArgs?.some(arg => 
          arg === '--use-anthropic' || 
          arg === '--anthropic' ||
          arg === '--claude'
        );
        
        // Only add the flag if not already present
        if (!hasClaudeFlag) {
          // In newer Aider versions it might just be the model name that matters,
          // but we'll try both methods to be safe
          aiderArgs.push('--anthropic'); // Try this flag version
        }
      }

      // Add model if specified
      if (this.options.model) {
        aiderArgs.push('--model', this.options.model);
      }
      
      // Add extra arguments if specified
      if (this.options.extraArgs && this.options.extraArgs.length > 0) {
        // Filter out the --use-anthropic flag if we've already added it
        const filteredArgs = this.isClaudeModel() 
          ? this.options.extraArgs.filter(arg => arg !== '--use-anthropic')
          : this.options.extraArgs;
          
        // Add each arg properly
        for (const arg of filteredArgs) {
          // Split the argument if it contains a space (e.g. "--key value")
          if (arg.includes(' ')) {
            const [flag, value] = arg.split(' ', 2);
            aiderArgs.push(flag, value);
          } else {
            aiderArgs.push(arg);
          }
        }
      }
      
      // Add the issue file as the last argument
      aiderArgs.push(issueFile);
      
      console.log(`Running Aider with arguments: ${aiderArgs.join(' ')}`);
      
      // Set environment variables for API keys if provided
      const env = { ...process.env };
      
      // Set the appropriate API keys based on model type
      if (this.isClaudeModel()) {
        // For Claude models, ensure the Anthropic API key is set
        if (this.options.anthropicApiKey) {
          env.ANTHROPIC_API_KEY = this.options.anthropicApiKey;
          console.log('Using Anthropic API key from options for Claude model');
        } else if (env.ANTHROPIC_API_KEY) {
          console.log('Using Anthropic API key from environment for Claude model');
        } else {
          console.log('WARNING: Using Claude model but no Anthropic API key found!');
        }
        
        // For Claude models, we don't need the OpenAI API key
        // But some versions of Aider might still check for it, so we'll set a dummy value if not present
        if (!env.OPENAI_API_KEY) {
          env.OPENAI_API_KEY = 'not-needed-for-claude';
          console.log('Set dummy OpenAI API key for compatibility with Claude');
        }
      } else {
        // For OpenAI models, ensure the OpenAI API key is set
        if (this.options.openAiApiKey) {
          env.OPENAI_API_KEY = this.options.openAiApiKey;
          console.log('Using OpenAI API key from options');
        } else if (env.OPENAI_API_KEY) {
          console.log('Using OpenAI API key from environment');
        } else {
          console.log('WARNING: Using OpenAI model but no OpenAI API key found!');
        }
      }
      
      // Log API key presence for debugging (don't log the actual keys!)
      console.log('Environment variables set:');
      console.log('- OPENAI_API_KEY:', env.OPENAI_API_KEY ? 'Set' : 'Not set');
      console.log('- ANTHROPIC_API_KEY:', env.ANTHROPIC_API_KEY ? 'Set' : 'Not set');
      
      // Run Aider with the issue file and stream output in real-time
      console.log('Starting Aider process - streaming output:');
      console.log('--------------------------------------------------');
      
      // Setup a check interval to detect if Aider is stuck
      let lastOutputTime = Date.now();
      let aiderActive = true;
      const activityInterval = setInterval(() => {
        const timeSinceLastOutput = Date.now() - lastOutputTime;
        if (aiderActive && timeSinceLastOutput > 30000) { // 30 seconds
          console.log(`[MONITOR] No output from Aider for ${Math.floor(timeSinceLastOutput/1000)} seconds. Still working...`);
        }
      }, 30000);
      
      let progressInterval: NodeJS.Timeout | null = null;
      
      try {
        // Use execa with streaming output
        const aiderProcess = execa('aider', aiderArgs, {
          cwd: this.workingDir,
          env,
          timeout: this.options.timeout,
          // Stream the output
          stdout: 'pipe',
          stderr: 'pipe',
          buffer: false // Important for real-time streaming
        });
        
        // Stream stdout with timestamp updates
        if (aiderProcess.stdout) {
          aiderProcess.stdout.on('data', (data) => {
            const output = data.toString();
            if (output.trim()) {
              console.log(`[AIDER] ${output.trim()}`);
              lastOutputTime = Date.now();
            }
          });
        }
        
        // Stream stderr
        if (aiderProcess.stderr) {
          aiderProcess.stderr.on('data', (data) => {
            const output = data.toString();
            if (output.trim()) {
              console.error(`[AIDER ERROR] ${output.trim()}`);
              lastOutputTime = Date.now();
            }
          });
        }
        
        // Start a progress indicator
        let progressDots = 0;
        progressInterval = setInterval(() => {
          if (aiderActive) {
            process.stdout.write('.');
            progressDots++;
            if (progressDots % 60 === 0) {
              process.stdout.write('\n');
            }
          }
        }, 5000);
        
        // Wait for Aider to complete
        const { stdout, stderr } = await aiderProcess;
        
        // Clear intervals once Aider is done
        clearInterval(activityInterval);
        if (progressInterval) clearInterval(progressInterval);
        aiderActive = false;
        
        // Add a newline if we were printing dots
        if (progressDots > 0 && progressDots % 60 !== 0) {
          console.log('');
        }
        
        console.log('--------------------------------------------------');
        console.log('Aider process completed');
        
        // Check if Aider made any changes
        console.log('Checking for changes made by Aider...');
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
            // Use proper GitHub authentication format based on token type
            let authenticatedPushUrl;
            
            if (url.hostname === 'github.com') {
              const tokenType = this.identifyTokenType(authToken);
              
              if (tokenType === 'GitHub App Installation Token') {
                // For GitHub App installation tokens (ghs_*)
                authenticatedPushUrl = `https://x-access-token:${authToken}@github.com${url.pathname}`;
              } else if (tokenType === 'OAuth App Token') {
                // For OAuth tokens
                authenticatedPushUrl = `https://oauth2:${authToken}@github.com${url.pathname}`;
              } else if (tokenType === 'Personal Access Token' || tokenType === 'Fine-grained Personal Access Token') {
                // For PATs
                authenticatedPushUrl = `https://oauth2:${authToken}@github.com${url.pathname}`;
              } else {
                // Fallback for unknown token types - try x-access-token format
                authenticatedPushUrl = `https://x-access-token:${authToken}@github.com${url.pathname}`;
                console.log('Using x-access-token format for GitHub authentication');
              }
            } else {
              // For non-GitHub repositories
              authenticatedPushUrl = repoUrl.replace(`${url.protocol}//`, `${url.protocol}//${authToken}@`);
            }
            
            // Apply the authenticated URL for push
            console.log(`Configuring authenticated remote for pushing to ${url.hostname}${url.pathname}`);
            await execa('git', ['remote', 'set-url', 'origin', authenticatedPushUrl], { cwd: this.workingDir });
          }
          
          // Push the changes
          console.log(`Pushing changes to branch: ${branchName}`);
          // Set environment variables for Git to prevent prompting
          const pushEnv = { 
            ...process.env, 
            GIT_TERMINAL_PROMPT: '0',
            GIT_ASKPASS: 'echo',
            GCM_INTERACTIVE: 'never'
          };
          
          try {
            await execa('git', ['push', 'origin', branchName], { 
              cwd: this.workingDir,
              env: pushEnv,
              timeout: 60000 // 1 minute timeout for push
            });
          } catch (pushError) {
            const errorMessage = pushError instanceof Error ? pushError.message : String(pushError);
            console.error(`Push error (sanitized): ${this.sanitizeErrorMessage(errorMessage)}`);
            
            if (errorMessage.includes('could not read Username') || 
                errorMessage.includes('Authentication failed') ||
                errorMessage.includes('403') || 
                errorMessage.includes('401')) {
              throw new Error('Failed to push changes: Authentication error. The token may not have write access to this repository.');
            }
            throw new Error(`Failed to push changes: ${this.sanitizeErrorMessage(errorMessage)}`);
          }
          
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
        // Make sure to clean up intervals if there's an error
        clearInterval(activityInterval);
        if (progressInterval) clearInterval(progressInterval);
        aiderActive = false;
        
        console.error('Error running Aider:', error);
        
        // Try to get additional information from the error
        let errorMessage = error instanceof Error ? error.message : String(error);
        
        // Sanitize error message to remove any tokens
        errorMessage = this.sanitizeErrorMessage(errorMessage);
        
        const fullError = errorMessage; // Keep the sanitized error for logging
        
        // Log the sanitized error for debugging
        console.error('Full Aider error:', fullError);
        
        // Check for specific error types
        if (errorMessage.includes('OPENAI_API_KEY') || errorMessage.includes('openai.error.AuthenticationError')) {
          if (this.isClaudeModel()) {
            errorMessage = 'API key error with Claude model. Trying these fixes:\n' +
              '1. Set both ANTHROPIC_API_KEY and a dummy OPENAI_API_KEY\n' +
              '2. Try different Claude flags: --anthropic, --claude, or --use-anthropic\n' +
              '3. Update to the latest version of Aider: pip install -U aider-chat';
          } else {
            errorMessage = 'OpenAI API key is missing or invalid. Please set the OPENAI_API_KEY environment variable.';
          }
        } else if (errorMessage.includes('ANTHROPIC_API_KEY') || 
                  errorMessage.includes('anthropic.AuthenticationError') ||
                  errorMessage.includes('anthropic.api_key')) {
          errorMessage = 'Anthropic API key is missing or invalid. Please set the ANTHROPIC_API_KEY environment variable.';
        } else if (errorMessage.includes('ENOENT') && errorMessage.includes('aider')) {
          errorMessage = 'Aider executable not found. Please install Aider with: pip install aider-chat';
        } else if (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('timeout')) {
          errorMessage = `Aider operation timed out after ${this.options.timeout ? this.options.timeout / 1000 : 300} seconds`;
        } else if (errorMessage.includes('unrecognized arguments')) {
          errorMessage = `Aider command line error: ${errorMessage}\n\nThis may be due to version differences. Try updating Aider: pip install -U aider-chat`;
        }
        
        // Log Claude-specific advice to console, but don't include it in the user-facing error message
        if (this.isClaudeModel()) {
          console.log('Additional Claude troubleshooting (for developers):');
          console.log('• Make sure ANTHROPIC_API_KEY is set and valid');
          console.log('• Try different flags for Claude in AIDER_EXTRA_ARGS (--anthropic or --claude)');
          console.log('• Check Aider version compatibility with Claude models');
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
    } catch (error) {
      console.error('Error running Aider:', error);
      
      // Try to get additional information from the error
      let errorMessage = error instanceof Error ? error.message : String(error);
      
      // Sanitize error message to remove any tokens
      errorMessage = this.sanitizeErrorMessage(errorMessage);
      
      const fullError = errorMessage; // Keep the sanitized error for logging
      
      // Log the sanitized error for debugging
      console.error('Full Aider error:', fullError);
      
      // Check for specific error types
      if (errorMessage.includes('OPENAI_API_KEY') || errorMessage.includes('openai.error.AuthenticationError')) {
        if (this.isClaudeModel()) {
          errorMessage = 'API key error with Claude model. Trying these fixes:\n' +
            '1. Set both ANTHROPIC_API_KEY and a dummy OPENAI_API_KEY\n' +
            '2. Try different Claude flags: --anthropic, --claude, or --use-anthropic\n' +
            '3. Update to the latest version of Aider: pip install -U aider-chat';
        } else {
          errorMessage = 'OpenAI API key is missing or invalid. Please set the OPENAI_API_KEY environment variable.';
        }
      } else if (errorMessage.includes('ANTHROPIC_API_KEY') || 
                 errorMessage.includes('anthropic.AuthenticationError') ||
                 errorMessage.includes('anthropic.api_key')) {
        errorMessage = 'Anthropic API key is missing or invalid. Please set the ANTHROPIC_API_KEY environment variable.';
      } else if (errorMessage.includes('ENOENT') && errorMessage.includes('aider')) {
        errorMessage = 'Aider executable not found. Please install Aider with: pip install aider-chat';
      } else if (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('timeout')) {
        errorMessage = `Aider operation timed out after ${this.options.timeout ? this.options.timeout / 1000 : 300} seconds`;
      } else if (errorMessage.includes('unrecognized arguments')) {
        errorMessage = `Aider command line error: ${errorMessage}\n\nThis may be due to version differences. Try updating Aider: pip install -U aider-chat`;
      }
      
      // Log Claude-specific advice to console, but don't include it in the user-facing error message
      if (this.isClaudeModel()) {
        console.log('Additional Claude troubleshooting (for developers):');
        console.log('• Make sure ANTHROPIC_API_KEY is set and valid');
        console.log('• Try different flags for Claude in AIDER_EXTRA_ARGS (--anthropic or --claude)');
        console.log('• Check Aider version compatibility with Claude models');
      }
      
      return {
        success: false,
        changes: [],
        message: `Error running Aider: ${errorMessage}`
      };
    }
  }

  /**
   * Sanitize error messages to remove sensitive information like tokens
   */
  private sanitizeErrorMessage(message: string): string {
    // Remove any GitHub tokens that might be in error messages
    message = message.replace(/https:\/\/[^@:]+:[^@:]+@/g, 'https://');
    message = message.replace(/https:\/\/[^@:]+@/g, 'https://');
    
    // Specifically handle GitHub tokens (ghs_*)
    message = message.replace(/ghs_[a-zA-Z0-9]{16,}/g, 'ghs_REDACTED');
    
    // Remove any filepath with potential tokens
    message = message.replace(/clone\s+['"]https:\/\/.*?@.*?['"]/, 'clone [REPOSITORY_URL]');
    message = message.replace(/git clone\s+'[^']*'/g, 'git clone [REPOSITORY_URL]');
    message = message.replace(/git clone\s+"[^"]*"/g, 'git clone [REPOSITORY_URL]');
    
    // Remove any API keys that might be in the message
    message = message.replace(/key[-_][a-zA-Z0-9]{20,}/g, 'key-REDACTED');
    message = message.replace(/sk[-_][a-zA-Z0-9]{20,}/g, 'sk-REDACTED');
    
    return message;
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

  /**
   * Validate GitHub token format
   */
  private isValidGitHubToken(token: string): boolean {
    // Check for common GitHub token formats
    const githubPAT = /^ghp_[a-zA-Z0-9]{20,}$/;           // Personal Access Token
    const githubOAuth = /^gho_[a-zA-Z0-9]{20,}$/;         // OAuth Access Token
    const githubInstall = /^ghs_[a-zA-Z0-9]{20,}$/;       // GitHub App Installation Token
    const githubUser = /^github_pat_[a-zA-Z0-9_]{20,}$/;   // Fine-grained PAT
    
    // If it matches a known pattern, great
    if (githubPAT.test(token) || 
        githubOAuth.test(token) || 
        githubInstall.test(token) || 
        githubUser.test(token)) {
      return true;
    }
    
    // Otherwise, check for basic requirements (some minimum length and no whitespace)
    // This is to accommodate different token formats while still catching obvious errors
    return token.length >= 10 && !/\s/.test(token);
  }

  /**
   * Attempts to clone a repository with proper error handling
   */
  private async attemptRepositoryClone(repoUrl: string, targetDir: string): Promise<void> {
    // Safely log the clone attempt without exposing tokens
    const safeUrl = repoUrl.replace(/\/\/[^@]+@/, '//').replace(/\/\/[^@:]+:[^@:]+@/, '//');
    console.log(`Cloning repository from ${safeUrl} to ${targetDir}`);
    
    try {
      // Setup environment for git
      const cloneEnv = { 
        ...process.env, 
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: 'echo',
        GCM_INTERACTIVE: 'never' // Disable GitHub credential manager interactive prompts
      };
      
      // Clone with credentials in environment and URL
      await execa('git', ['clone', repoUrl, targetDir, '--depth', '1'], { 
        env: cloneEnv, 
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60000 // 1 minute timeout for clone
      });
      
      console.log('Repository clone successful');
    } catch (cloneError) {
      const errorMessage = cloneError instanceof Error ? cloneError.message : String(cloneError);
      
      // Check for common auth errors
      if (errorMessage.includes('Authentication failed') || 
          errorMessage.includes('Invalid username or password') ||
          errorMessage.includes('could not read Username') ||
          errorMessage.includes('403') ||
          errorMessage.includes('401')) {
        
        // Provide specific error for permission issues
        if (errorMessage.includes('Permission to') && errorMessage.includes('denied')) {
          throw new Error('Permission denied. The token does not have access to this repository. Check that it has "contents: read" permission.');
        }
        
        throw new Error('Authentication failed. Token may be invalid or missing required permissions (needs "contents: read" at minimum).');
      }
      
      // For timeout errors
      if (errorMessage.includes('timed out') || errorMessage.includes('ETIMEDOUT')) {
        throw new Error('Repository clone timed out. Check network connectivity or repository size.');
      }
      
      // For other errors, provide the sanitized message
      throw new Error(`Repository clone failed: ${this.sanitizeErrorMessage(errorMessage)}`);
    }
  }

  /**
   * Identify the type of token provided
   */
  private identifyTokenType(token: string): string {
    if (token.startsWith('ghp_')) return 'Personal Access Token';
    if (token.startsWith('gho_')) return 'OAuth App Token';
    if (token.startsWith('ghs_')) return 'GitHub App Installation Token';
    if (token.startsWith('github_pat_')) return 'Fine-grained Personal Access Token';
    return 'Unknown Token Type';
  }
}
