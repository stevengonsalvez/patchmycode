import { exec, spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as process from 'process';
import * as util from 'util';
import { AiderMode } from './mode-selector.js';
import config from './config.js';

const execPromise = util.promisify(exec);

export interface PatchResult {
  success: boolean;
  message: string;
  changes: string[];
}

export interface PatchOptions {
  mode?: string;
  model?: string;
  extraArgs?: string[];
  timeout?: number;
  includeFiles?: string[];
  excludeFiles?: string[];
  openaiKey?: string;
  anthropicKey?: string;
  openrouterKey?: string;
}

// Model provider interface for better abstraction
interface ModelProvider {
  name: string;
  setupEnvironment(env: NodeJS.ProcessEnv): void;
  getAiderArgs(baseArgs: string[]): string[];
  validateApiKey(): boolean;
  getApiKeyError(): string;
}

// OpenAI model provider
class OpenAIProvider implements ModelProvider {
  name = 'OpenAI';
  private apiKey: string;
  private keys: string[] = [];
  
  constructor(apiKey?: string, apiKeys?: string[]) {
    // Setup primary key
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || '';
    
    // Setup multiple keys if available
    if (apiKeys && apiKeys.length > 0) {
      this.keys = apiKeys;
    } else if (this.apiKey) {
      this.keys = [this.apiKey];
    } else if (process.env.OPENAI_API_KEYS) {
      this.keys = process.env.OPENAI_API_KEYS.split(',').map(k => k.trim()).filter(Boolean);
    }
  }
  
  setupEnvironment(env: NodeJS.ProcessEnv): void {
    // If we have multiple keys, randomly select one
    if (this.keys.length > 0) {
      const selectedKey = this.keys[Math.floor(Math.random() * this.keys.length)];
      env.OPENAI_API_KEY = selectedKey;
      console.log('Using OpenAI API key from available pool');
    } else if (this.apiKey) {
      env.OPENAI_API_KEY = this.apiKey;
      console.log('Using OpenAI API key from options');
    } else if (env.OPENAI_API_KEY) {
      console.log('Using OpenAI API key from environment');
    } else {
      console.log('WARNING: No OpenAI API key found!');
    }
  }
  
  getAiderArgs(baseArgs: string[]): string[] {
    // No additional args needed for OpenAI models
    return baseArgs;
  }
  
  validateApiKey(): boolean {
    return !!this.apiKey || !!process.env.OPENAI_API_KEY;
  }
  
  getApiKeyError(): string {
    return 'OpenAI API key is missing or invalid. Please set the OPENAI_API_KEY environment variable.';
  }
}

// Anthropic model provider
class AnthropicProvider implements ModelProvider {
  name = 'Anthropic';
  private apiKey: string;
  private keys: string[] = [];
  
  constructor(apiKey?: string, apiKeys?: string[]) {
    // Setup primary key
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
    
    // Setup multiple keys if available
    if (apiKeys && apiKeys.length > 0) {
      this.keys = apiKeys;
    } else if (this.apiKey) {
      this.keys = [this.apiKey];
    } else if (process.env.ANTHROPIC_API_KEYS) {
      this.keys = process.env.ANTHROPIC_API_KEYS.split(',').map(k => k.trim()).filter(Boolean);
    }
  }
  
  setupEnvironment(env: NodeJS.ProcessEnv): void {
    // If we have multiple keys, randomly select one
    if (this.keys.length > 0) {
      const selectedKey = this.keys[Math.floor(Math.random() * this.keys.length)];
      env.ANTHROPIC_API_KEY = selectedKey;
      console.log('Using Anthropic API key from available pool for Claude model');
    } else if (this.apiKey) {
      env.ANTHROPIC_API_KEY = this.apiKey;
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
  }
  
  getAiderArgs(baseArgs: string[]): string[] {
    // Add Claude-specific flag
    const hasClaudeFlag = baseArgs.some(arg => 
      arg === '--use-anthropic' || 
      arg === '--anthropic' ||
      arg === '--claude'
    );
    
    if (!hasClaudeFlag) {
      return [...baseArgs, '--anthropic'];
    }
    
    return baseArgs;
  }
  
  validateApiKey(): boolean {
    return !!this.apiKey || !!process.env.ANTHROPIC_API_KEY;
  }
  
  getApiKeyError(): string {
    return 'Anthropic API key is missing or invalid. Please set the ANTHROPIC_API_KEY environment variable.';
  }
}

// OpenRouter provider for models like DeepSeek
class OpenRouterProvider implements ModelProvider {
  name = 'OpenRouter';
  private apiKey: string;
  
  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
  }
  
  setupEnvironment(env: NodeJS.ProcessEnv): void {
    if (this.apiKey) {
      env.OPENROUTER_API_KEY = this.apiKey;
      // OpenRouter also needs OPENAI_API_BASE set
      env.OPENAI_API_BASE = 'https://openrouter.ai/api/v1';
      console.log('Using OpenRouter API key from options');
    } else if (env.OPENROUTER_API_KEY) {
      env.OPENAI_API_BASE = 'https://openrouter.ai/api/v1';
      console.log('Using OpenRouter API key from environment');
    } else {
      console.log('WARNING: Using OpenRouter but no API key found!');
    }
  }
  
  getAiderArgs(baseArgs: string[]): string[] {
    // Add OpenRouter-specific flag if needed
    const hasOpenRouterFlag = baseArgs.some(arg => 
      arg === '--openrouter' || 
      arg.startsWith('--openrouter=')
    );
    
    if (!hasOpenRouterFlag) {
      return [...baseArgs, '--openrouter'];
    }
    
    return baseArgs;
  }
  
  validateApiKey(): boolean {
    return !!this.apiKey || !!process.env.OPENROUTER_API_KEY;
  }
  
  getApiKeyError(): string {
    return 'OpenRouter API key is missing or invalid. Please set the OPENROUTER_API_KEY environment variable.';
  }
}

// Factory function to create the appropriate model provider
function createModelProvider(options: PatchOptions): ModelProvider {
  const model = options.model?.toLowerCase() || 'gpt-4o';
  
  if (model.includes('claude') || model.includes('anthropic')) {
    return new AnthropicProvider(options.anthropicKey, config.anthropicKeys);
  } else if (model.includes('deepseek')) {
    return new OpenRouterProvider(options.openrouterKey || config.openrouterKey);
  } else if (model.includes('gemini')) {
    return new OpenRouterProvider(options.openrouterKey || config.openrouterKey);
  } else if (model.includes('qwen')) {
    return new OpenRouterProvider(options.openrouterKey || config.openrouterKey);
  } else if (model.includes('codestral')) {
    return new OpenRouterProvider(options.openrouterKey || config.openrouterKey);
  } else {
    // Default to OpenAI
    return new OpenAIProvider(options.openaiKey, config.openaiKeys);
  }
}

/**
 * Client for interacting with the Aider patch application
 */
export class PatchClient {
  private options: PatchOptions;
  private initialized: boolean = false;
  private tempDir: string | null = null;
  private modelProvider: ModelProvider;

  constructor(options: PatchOptions = {}) {
    this.options = {
      mode: options.mode || config.defaultMode,
      model: options.model || config.model,
      extraArgs: options.extraArgs || config.extraArgs,
      timeout: options.timeout || config.patchTimeout,
      includeFiles: options.includeFiles || config.includeFiles,
      excludeFiles: options.excludeFiles || config.excludeFiles,
      openaiKey: options.openaiKey,
      anthropicKey: options.anthropicKey,
      openrouterKey: options.openrouterKey
    };
    
    // Create the appropriate model provider
    this.modelProvider = createModelProvider(this.options);
  }
  
  /**
   * Initialize the patch client
   */
  async init(): Promise<void> {
    try {
      // Check if aider is installed
      const result = await execPromise('aider --version');
      console.log(`Found aider: ${result.stdout.trim()}`);
      this.initialized = true;
      
      // Create a temporary directory for operations
      this.tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'patchmycode-'));
      console.log(`Created temporary directory: ${this.tempDir}`);
    } catch (error) {
      console.error('Error initializing aider:', error);
      throw new Error('Failed to initialize the patch client. Is aider installed?');
    }
  }
  
  /**
   * Get arguments specific to the current mode
   */
  private getModeArgs(): string[] {
    // Get mode-specific arguments
    switch (this.options.mode) {
      case 'architect':
        return [
          '--system-message',
          'You are an expert software architect. Focus on making structural improvements, refactoring, and ensuring the codebase follows best practices and design patterns. Consider the big picture and long-term maintainability.',
          '--map',
          '--apply'
        ];
      
      case 'patcher':
        return [
          '--system-message',
          'You are an expert programmer focused on fixing bugs and implementing specific features. Pay attention to detail and make targeted changes to solve the immediate problem without unnecessary refactoring.',
          '--diff',
          '--apply'
        ];
      
      case 'hybrid:security':
        return [
          '--system-message',
          'You are a security expert. Identify and fix security vulnerabilities, ensure proper input validation, prevent injection attacks, and follow security best practices.',
          '--diff',
          '--apply'
        ];
      
      case 'hybrid:performance':
        return [
          '--system-message',
          'You are a performance optimization expert. Identify bottlenecks, improve algorithm efficiency, reduce unnecessary operations, and optimize resource usage.',
          '--diff',
          '--apply'
        ];
      
      case 'hybrid:typescript':
        return [
          '--system-message',
          'You are a TypeScript expert. Add proper type annotations, convert JavaScript to TypeScript, improve type safety, and leverage TypeScript features effectively.',
          '--diff',
          '--apply'
        ];
      
      default:
        return [];
    }
  }
  
  /**
   * Get the model-specific provider for the current configuration
   */
  private getModelProvider(): ModelProvider {
    const modelName = this.getModelForCurrentMode();
    
    if (modelName.includes('claude')) {
      return new AnthropicProvider(
        this.options.anthropicKey, 
        config.anthropicKeys
      );
    } else if (modelName.startsWith('or:') || modelName.includes('/') || this.options.openrouterKey || config.openrouterKey) {
      return new OpenRouterProvider(this.options.openrouterKey || config.openrouterKey);
    } else {
      // Default to OpenAI for all other models
      return new OpenAIProvider(
        this.options.openaiKey, 
        config.openaiKeys
      );
    }
  }
  
  /**
   * Get the correct model for the current mode, prioritizing mode-specific settings
   */
  private getModelForCurrentMode(): string {
    // Check if we have a mode-specific model
    if (config.modeModels && this.options.mode && config.modeModels[this.options.mode]) {
      return config.modeModels[this.options.mode];
    }
    
    // Fallback to the general model option
    return this.options.model || config.model || 'gpt-4o';
  }
  
  /**
   * Get the extra arguments for the current mode
   */
  private getExtraArgsForCurrentMode(): string[] {
    // Check if we have mode-specific extra args
    if (config.modeExtraArgs && this.options.mode && config.modeExtraArgs[this.options.mode]) {
      return config.modeExtraArgs[this.options.mode];
    }
    
    // Fallback to the general extra args
    return this.options.extraArgs || config.extraArgs || [];
  }
  
  /**
   * Fix an issue based on the provided details
   */
  async fixIssue(
    repoUrl: string,
    issueTitle: string,
    issueBody: string,
    branchName: string,
    authToken?: string,
    baseBranch?: string
  ): Promise<PatchResult> {
    if (!this.initialized || !this.tempDir) {
      throw new Error('Patch client not initialized. Call init() first.');
    }
    
    console.log(`Fixing issue: ${issueTitle}`);
    
    // Create a directory specific to this issue
    const issueDir = path.join(this.tempDir, `issue-${Date.now()}`);
    await fs.promises.mkdir(issueDir, { recursive: true });
    
    try {
      // Create the git URL with authentication if provided
      let gitUrl = repoUrl;
      if (authToken) {
        const url = new URL(repoUrl);
        gitUrl = `${url.protocol}//${authToken}@${url.host}${url.pathname}`;
      }
      
      // Clone the repository
      console.log('Cloning repository...');
      await this.executeCommand('git', ['clone', '--depth', '1', gitUrl, issueDir]);
      
      // Change to the issue directory
      process.chdir(issueDir);
      
      // Create a new branch for the fix
      if (baseBranch) {
        // If a base branch is specified, fetch and check it out first
        console.log(`Fetching and checking out base branch: ${baseBranch}`);
        await this.executeCommand('git', ['fetch', 'origin', baseBranch]);
        await this.executeCommand('git', ['checkout', baseBranch]);
      }
      
      console.log(`Creating new branch: ${branchName}`);
      await this.executeCommand('git', ['checkout', '-b', branchName]);
      
      // Create a temporary file with the issue details
      const issueFile = path.join(issueDir, 'ISSUE.md');
      await fs.promises.writeFile(issueFile, `# ${issueTitle}\n\n${issueBody}`);
      
      // Get baseline list of files
      const beforeFiles = await this.getTrackedFiles(issueDir);
      
      // Prepare args for aider
      const model = this.getModelForCurrentMode();
      const extraArgs = this.getExtraArgsForCurrentMode();
      
      const args = [
        '--model', model,
        '--no-git-push', // We'll handle pushing
        ...this.getModeArgs(),
        ...extraArgs,
        issueFile
      ];
      
      console.log(`Running aider with mode: ${this.options.mode}, model: ${model}`);
      console.log(`Arguments: ${args.join(' ')}`);
      
      // Run aider with a timeout
      const aiderProcess = spawn('aider', args, {
        cwd: issueDir,
        stdio: 'pipe',
        env: {
          ...process.env,
          AIDER_MODE: this.options.mode || 'patcher',
          AIDER_DEBUG: '1'
        }
      });
      
      // Setup the model provider's environment variables
      this.modelProvider.setupEnvironment(aiderProcess.env as NodeJS.ProcessEnv);
      
      let stdout = '';
      let stderr = '';
      
      aiderProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        console.log(`[aider] ${chunk}`);
      });
      
      aiderProcess.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        console.error(`[aider-err] ${chunk}`);
      });
      
      // Set timeout
      const timeout = setTimeout(() => {
        console.log(`Timeout reached (${this.options.timeout}s). Terminating aider.`);
        aiderProcess.kill('SIGTERM');
      }, (this.options.timeout || 600) * 1000);
      
      // Wait for aider to complete
      const exitCode = await new Promise<number>((resolve) => {
        aiderProcess.on('close', (code) => {
          clearTimeout(timeout);
          resolve(code || 0);
        });
      });
      
      console.log(`Aider exited with code ${exitCode}`);
      
      // Get list of files that were modified
      const afterFiles = await this.getTrackedFiles(issueDir);
      const stagedChanges = await this.getStagedChanges(issueDir);
      
      // Check if there were any changes
      if (stagedChanges.length === 0) {
        console.log('No changes made by aider.');
        return {
          success: false,
          message: 'No changes made. The AI couldn\'t find a solution or encountered an error.',
          changes: []
        };
      }
      
      // Commit changes
      console.log('Committing changes...');
      await this.executeCommand('git', ['commit', '-m', `Fix: ${issueTitle}\n\nAuto-generated fix by patchmycode.`]);
      
      // Push the changes
      console.log('Pushing changes...');
      await this.executeCommand('git', ['push', '--set-upstream', 'origin', branchName]);
      
      // Get the list of changed files
      const changedFiles = stagedChanges.map(line => {
        const parts = line.split('\t');
        return parts[parts.length - 1];
      });
      
      console.log(`Changes made to ${changedFiles.length} files:`, changedFiles);
      
      return {
        success: true,
        message: 'Successfully applied changes to fix the issue.',
        changes: changedFiles
      };
    } catch (error) {
      console.error('Error fixing issue:', error);
      return {
        success: false,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        changes: []
      };
    }
  }
  
  /**
   * Execute a command in the given directory
   */
  private async executeCommand(command: string, args: string[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const process = spawn(command, args, { stdio: 'inherit' });
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${command} ${args.join(' ')}`));
        }
      });
      
      process.on('error', (err) => {
        reject(err);
      });
    });
  }
  
  /**
   * Get list of tracked files in a git repository
   */
  private async getTrackedFiles(repoDir: string): Promise<string[]> {
    const { stdout } = await execPromise('git ls-files', { cwd: repoDir });
    return stdout.trim().split('\n').filter(Boolean);
  }
  
  /**
   * Get list of staged changes
   */
  private async getStagedChanges(repoDir: string): Promise<string[]> {
    try {
      const { stdout } = await execPromise('git diff --name-status HEAD', { cwd: repoDir });
      return stdout.trim().split('\n').filter(Boolean);
    } catch (error) {
      // Handle case where there's no previous commit (new repository)
      return [];
    }
  }
  
  /**
   * Clean up temporary resources
   */
  async cleanup(): Promise<void> {
    if (this.tempDir) {
      try {
        await fs.promises.rm(this.tempDir, { recursive: true, force: true });
        console.log(`Cleaned up temporary directory: ${this.tempDir}`);
        this.tempDir = null;
      } catch (error) {
        console.error('Error cleaning up temporary directory:', error);
      }
    }
  }
}
