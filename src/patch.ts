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
  branchName?: string;
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
  modelProvider?: string;
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
  }
  
  getAiderArgs(baseArgs: string[]): string[] {
    // Use the appropriate Claude model flag
    if (this.apiKey.includes('claude-3-opus') || process.env.ANTHROPIC_API_KEY?.includes('claude-3-opus')) {
      return baseArgs.includes('--opus') ? baseArgs : [...baseArgs, '--opus'];
    } else if (this.apiKey.includes('claude-3-sonnet') || process.env.ANTHROPIC_API_KEY?.includes('claude-3-sonnet')) {
      return baseArgs.includes('--sonnet') ? baseArgs : [...baseArgs, '--sonnet'];
    } else if (this.apiKey.includes('claude-3-haiku') || process.env.ANTHROPIC_API_KEY?.includes('claude-3-haiku')) {
      return baseArgs.includes('--haiku') ? baseArgs : [...baseArgs, '--haiku'];
    } else {
      // Default to sonnet if we can't determine the model
      return baseArgs.includes('--sonnet') ? baseArgs : [...baseArgs, '--sonnet'];
    }
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
    // Use the appropriate flag based on model
    if (this.apiKey.includes('deepseek') || process.env.OPENROUTER_API_KEY?.includes('deepseek')) {
      return baseArgs.includes('--deepseek') ? baseArgs : [...baseArgs, '--deepseek'];
    } else {
      // Default to deepseek flag if we can't determine the model
      return baseArgs.includes('--deepseek') ? baseArgs : [...baseArgs, '--deepseek'];
    }
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
      openrouterKey: options.openrouterKey,
      modelProvider: options.modelProvider || config.modelProvider
    };
    
    // Create the appropriate model provider
    this.modelProvider = this.getModelProvider();
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
    // Base arguments for all modes
    const baseArgs = [
      '--git',
      '--no-auto-commits'
    ];

    // Mode-specific arguments
    switch (this.options.mode) {
      case 'architect':
        // Architect mode has a built-in flag in Aider
        return [
          ...baseArgs,
          '--architect',
          '--map-tokens', '2048',
          '--map-refresh', 'always'
        ];
      
      case 'patcher':
        // Patcher mode focuses on targeted changes
        return [
          ...baseArgs,
          '--edit-format', 'diff',
          '--edit-retry', '3',
          '--map-tokens', '0'
        ];
      
      // Handle all hybrid modes with appropriate map settings
      case 'hybrid:security':
      case 'hybrid:performance':
        return [
          ...baseArgs,
          '--edit-retry', '3',
          '--map-tokens', '1536',
          '--map-refresh', 'auto'
        ];
      
      case 'hybrid:typescript':
        return [
          ...baseArgs,
          '--edit-retry', '3',
          '--map-tokens', '1024',
          '--map-refresh', 'files'
        ];
      
      default:
        return baseArgs;
    }
  }
  
  /**
   * Get the model-specific provider for the current configuration
   */
  private getModelProvider(): ModelProvider {
    // First check for explicitly configured provider
    const provider = this.getProviderForCurrentMode();
    
    if (provider) {
      // Use explicitly configured provider
      switch (provider) {
        case 'anthropic':
          return new AnthropicProvider(
            this.options.anthropicKey, 
            config.anthropicKeys
          );
        case 'openrouter':
          return new OpenRouterProvider(
            this.options.openrouterKey || config.openrouterKey
          );
        case 'openai':
          return new OpenAIProvider(
            this.options.openaiKey, 
            config.openaiKeys
          );
      }
    }
    
    // If no explicit provider, fall back to model name detection
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
   * Get the provider for the current mode, prioritizing mode-specific settings
   */
  private getProviderForCurrentMode(): string | undefined {
    // Check if we have mode-specific provider
    if (config.modeProviders && this.options.mode && config.modeProviders[this.options.mode]) {
      return config.modeProviders[this.options.mode];
    }
    
    // Check for default provider in mode providers
    if (config.modeProviders && config.modeProviders['default']) {
      return config.modeProviders['default'];
    }
    
    // Check for global provider
    if (this.options.modelProvider) {
      return this.options.modelProvider;
    }
    
    // Finally check for config default
    return config.modelProvider;
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
   * Filter out deprecated arguments that are no longer supported
   */
  private filterDeprecatedArgs(args: string[]): string[] {
    // List of deprecated arguments that are no longer supported
    const deprecatedArgs = [
      '--use-anthropic',
      '--anthropic',
      '--claude',
      '--openrouter',
      '--no-git-push'
    ];
    
    // Filter out deprecated arguments
    const filteredArgs: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      // Skip if it's a deprecated flag
      if (deprecatedArgs.includes(arg)) {
        console.log(`Skipping deprecated argument: ${arg}`);
        continue;
      }
      
      // Skip if it's a value for a deprecated flag
      if (i > 0 && deprecatedArgs.includes(args[i-1]) && !arg.startsWith('--')) {
        continue;
      }
      
      filteredArgs.push(arg);
    }
    
    return filteredArgs;
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
    baseBranch?: string,
    progressCallback?: (status: string, data?: any) => void
  ): Promise<PatchResult> {
    if (!this.initialized || !this.tempDir) {
      throw new Error('Patch client not initialized. Call init() first.');
    }
    
    console.log(`Fixing issue: ${issueTitle}`);
    
    // Notify about starting if callback exists
    if (progressCallback) {
      progressCallback('starting', { title: issueTitle });
    }
    
    // Create a directory specific to this issue
    const issueDir = path.join(this.tempDir, `issue-${Date.now()}`);
    await fs.promises.mkdir(issueDir, { recursive: true });
    
    try {
      // Extract issue number from the branch name or title
      let issueNumber: string | null = null;
      const issueNumberMatch = branchName.match(/issue-(\d+)/) || issueTitle.match(/issue[- ]?#?(\d+)/i);
      if (issueNumberMatch && issueNumberMatch[1]) {
        issueNumber = issueNumberMatch[1];
      }
      
      // Generate unique branch name with random hash and issue number
      const uniqueHash = Math.random().toString(36).substring(2, 8); // 6 character random string
      const mode = this.options.mode || 'fix';
      const uniqueBranchName = issueNumber 
        ? `${mode}-${uniqueHash}-${issueNumber}`
        : `${mode}-${uniqueHash}-${Date.now().toString().substring(9)}`; // Use last digits of timestamp as fallback
      
      console.log(`Using unique branch name: ${uniqueBranchName} (original: ${branchName})`);
      if (progressCallback) {
        progressCallback('branch_generated', { name: uniqueBranchName, original: branchName });
      }
      
      // Create the git URL with authentication if provided
      let gitUrl = repoUrl;
      if (authToken) {
        const url = new URL(repoUrl);
        gitUrl = `${url.protocol}//${authToken}@${url.host}${url.pathname}`;
      }
      
      // Clone the repository
      console.log('Cloning repository...');
      if (progressCallback) {
        progressCallback('cloning', { repo: repoUrl });
      }
      await this.executeCommand('git', ['clone', '--depth', '1', gitUrl, issueDir]);
      
      // Change to the issue directory
      process.chdir(issueDir);
      
      // Create a new branch for the fix
      if (baseBranch) {
        // If a base branch is specified, fetch and check it out first
        console.log(`Fetching and checking out base branch: ${baseBranch}`);
        if (progressCallback) {
          progressCallback('checkout', { branch: baseBranch });
        }
        await this.executeCommand('git', ['fetch', 'origin', baseBranch]);
        await this.executeCommand('git', ['checkout', baseBranch]);
      }
      
      console.log(`Creating new branch: ${uniqueBranchName}`);
      if (progressCallback) {
        progressCallback('branch', { name: uniqueBranchName });
      }
      await this.executeCommand('git', ['checkout', '-b', uniqueBranchName]);
      
      // Create a temporary file with the issue details
      const issueFile = path.join(issueDir, 'ISSUE.md');
      await fs.promises.writeFile(issueFile, `# ${issueTitle}\n\n${issueBody}`);
      
      // Get baseline list of files
      const beforeFiles = await this.getTrackedFiles(issueDir);
      
      // Prepare args for aider
      const model = this.getModelForCurrentMode();
      const extraArgs = this.getExtraArgsForCurrentMode();
      
      // Create message with rules
      let message = `# ${issueTitle}\n\n${issueBody}`;
      
      // Add rules if they exist in config
      if (config.aiderRules && config.aiderRules.length > 0) {
        message += '\n\n## Development Rules\n';
        config.aiderRules.forEach(rule => {
          message += `\n- ${rule}`;
        });
        console.log('[aider] Added development rules to message');
      }
      
      let args = [
        '--model', model,
        ...this.getModeArgs(),
        ...extraArgs,
        '--message', message
      ];
      
      // Filter out any deprecated arguments
      args = this.filterDeprecatedArgs(args);
      
      console.log(`Running aider with mode: ${this.options.mode}, model: ${model}`);
      if (progressCallback) {
        progressCallback('aider_start', { 
          mode: this.options.mode,
          model: model,
          args: args.join(' ')
        });
      }
      console.log(`Arguments: ${args.join(' ')}`);
      
      // Create environment with model provider setup
      const processEnv = { ...process.env };
      processEnv.AIDER_MODE = this.options.mode || 'patcher';
      processEnv.AIDER_DEBUG = '1';
      
      // Setup the model provider's environment variables
      this.modelProvider.setupEnvironment(processEnv);
      
      // Add YES_ALWAYS environment variable to make Aider auto-accept all prompts
      processEnv.AIDER_YES_ALWAYS = '1';
      
      // Run aider directly without piping
      console.log('Running aider with auto-accept prompts via AIDER_YES_ALWAYS=1');
      
      // Spawn aider process with appropriate configuration
      const aiderProcess = spawn('aider', args, {
        cwd: issueDir,
        stdio: 'pipe',
        env: processEnv
      });
      
      // Add error handling for stdin
      aiderProcess.stdin.on('error', (err: NodeJS.ErrnoException) => {
        console.error('[aider] Error with stdin:', err);
        if (err.code === 'EPIPE') {
          console.log('[aider] EPIPE error detected - process may have closed its input stream');
          // We'll let the process continue as it might still be running
        }
      });
      
      // Helper function to send input to aider process if needed
      const sendInputToAider = (input: string): Promise<void> => {
        return new Promise<void>((resolve, reject) => {
          if (!aiderProcess || !aiderProcess.stdin.writable) {
            return reject(new Error('Aider process is not available or stdin is not writable'));
          }
          
          try {
            // Make sure input always ends with a newline
            const formattedInput = input.endsWith('\n') ? input : `${input}\n`;
            aiderProcess.stdin.write(formattedInput, 'utf8', () => {
              resolve();
            });
          } catch (error) {
            console.error('[aider] Error sending input:', error);
            reject(error);
          }
        });
      };
      
      let textOutput = '';
      let stderr = '';
      let dataBuffer = '';
      let lastActivityTime = Date.now();
      let exitDueToUpgrade = false;
      
      // Track activity to detect progress
      let lastActivity = Date.now();
      let consecutiveHealthChecks = 0;
      let initialPromptReceived = false;
      let exitConditionMet = false;
      
      const activityInterval = setInterval(() => {
        const inactiveTime = (Date.now() - lastActivity) / 1000;
        if (progressCallback && inactiveTime > 30) { // Report if no activity for 30+ seconds
          progressCallback('status', { 
            status: 'working', 
            inactive_seconds: Math.floor(inactiveTime),
            last_output: textOutput.split('\n').slice(-5).join('\n') // Last few lines of output
          });
        }
      }, 30000); // Check every 30 seconds
      
      // Data event received from Aider's stdout
      aiderProcess.stdout.on('data', (data: Buffer) => {
        try {
          const chunk = data.toString();
          dataBuffer += chunk;
          lastActivityTime = Date.now();
          
          // Check for upgrade message
          if (chunk.includes('Re-run aider to use new version')) {
            console.log('[aider] Detected version upgrade message');
            exitDueToUpgrade = true;
          }
          
          textOutput += chunk;
          console.log(`[aider] ${chunk}`);
          
          // Update activity timestamp
          lastActivity = Date.now();
          consecutiveHealthChecks = 0; // Reset health check counter on any output
          
          // We don't need complex prompt handling with 'yes' pipe approach
          // Just log interesting events for monitoring
          
          // Check for specific patterns to report progress
          if (progressCallback) {
            if (chunk.includes('Edit the files?')) {
              progressCallback('status', { status: 'edit_prompt' });
              console.log('[aider] Edit files prompt detected (auto-responding with yes)');
            } else if (chunk.includes('Sending request')) {
              progressCallback('status', { status: 'thinking' });
            } else if (chunk.includes('Committing')) {
              progressCallback('status', { status: 'committing' });
            } else if (chunk.includes('Applying changes')) {
              progressCallback('status', { status: 'applying' });
            } else if (/Changes to [0-9]+ files/.test(chunk)) {
              progressCallback('status', { status: 'changes_detected' });
            }
          }
          
          // Publish to progress
          if (progressCallback) {
            progressCallback('output', { text: chunk });
          }
          
          // Check for exit conditions
          if (chunk.includes('I\'ll help you')) {
            initialPromptReceived = true;
          }
          
          if (chunk.includes('Commit staged changes?')) {
            console.log('[aider] Detected commit prompt, exiting soon.');
            exitConditionMet = true;
          }
          
          if (chunk.includes('Goodbye!') || chunk.includes('Exiting')) {
            console.log('[aider] Detected goodbye message, exiting.');
            exitConditionMet = true;
          }
        } catch (err) {
          console.error('[aider] Error handling stdout data:', err);
        }
      });
      
      aiderProcess.stderr.on('data', (data) => {
        try {
          const chunk = data.toString();
          stderr += chunk;
          console.error(`[aider-err] ${chunk}`);
          
          // Update activity timestamp
          lastActivity = Date.now();
          
          // Send error updates if callback exists
          if (progressCallback && chunk.trim()) {
            progressCallback('error', { text: chunk });
          }
        } catch (err) {
          console.error('[aider] Error handling stderr data:', err);
        }
      });
      
      // Setup a health check interval to verify process is still responsive
      const healthCheckInterval = setInterval(() => {
        // If process is still running but not active, this could be a sign of being stuck
        if (aiderProcess && aiderProcess.stdin.writable) {
          // Only send a newline if there's been no activity for a while
          const inactiveSecs = (Date.now() - lastActivity) / 1000;
          if (inactiveSecs > 60) { // More than a minute of inactivity
            try {
              // Send a newline to see if we get any response
              sendInputToAider('\n')
                .then(() => {
                  console.log('[aider] Sent newline to check if process is responsive');
                  consecutiveHealthChecks++;
                  
                  if (progressCallback) {
                    progressCallback('health_check', { 
                      inactive_seconds: inactiveSecs,
                      consecutive_checks: consecutiveHealthChecks 
                    });
                  }
                })
                .catch(err => {
                  console.error('[aider] Error sending health check:', err);
                  // If we get an EPIPE error, the process is likely dead
                  if (err.code === 'EPIPE') {
                    console.error('[aider] EPIPE error - process appears to be dead. Forcing termination.');
                    consecutiveHealthChecks = 5; // Force termination on next check
                  }
                });
              
              // If we've tried 5 consecutive health checks without any response, 
              // aider is likely completely stuck - terminate it
              if (consecutiveHealthChecks >= 5) {
                console.error('[aider] Process appears to be unresponsive after multiple health checks. Terminating...');
                if (progressCallback) {
                  progressCallback('forced_termination', { 
                    reason: 'unresponsive', 
                    inactive_seconds: inactiveSecs 
                  });
                }
                
                try {
                  aiderProcess.kill('SIGTERM');
                  
                  // Give it 5 seconds to terminate gracefully, then force kill if needed
                  setTimeout(() => {
                    try {
                      // Check if process is still running and kill forcefully if needed
                      if (aiderProcess.kill(0)) {
                        console.error('[aider] Process still alive after SIGTERM. Sending SIGKILL...');
                        aiderProcess.kill('SIGKILL');
                      }
                    } catch (e) {
                      // If kill(0) throws, the process is already gone
                    }
                  }, 5000);
                } catch (killError) {
                  console.error('[aider] Error while trying to terminate process:', killError);
                }
              }
            } catch (error) {
              console.error('[aider] Error during health check:', error);
            }
          }
        }
      }, 60000); // Check every minute
      
      // Set timeout
      const timeout = setTimeout(() => {
        console.log(`Timeout reached (${this.options.timeout}s). Terminating aider.`);
        if (progressCallback) {
          progressCallback('timeout', { seconds: this.options.timeout });
        }
        aiderProcess.kill('SIGTERM');
      }, (this.options.timeout || 600) * 1000);
      
      // Set absolute maximum time (failsafe)
      const maxTimeInMinutes = 30; // Maximum 30 minutes regardless of activity
      const absoluteMaxTimeout = setTimeout(() => {
        console.log(`Absolute maximum time reached (${maxTimeInMinutes} minutes). Forcibly terminating aider.`);
        if (progressCallback) {
          progressCallback('max_time_reached', { minutes: maxTimeInMinutes });
        }
        // Force kill immediately
        try {
          aiderProcess.kill('SIGKILL');
        } catch (e) {
          console.error('Error force-killing aider process:', e);
        }
      }, maxTimeInMinutes * 60 * 1000);
      
      // Wait for aider to complete
      const exitCode = await new Promise<number>((resolve) => {
        aiderProcess.on('close', (code) => {
          clearTimeout(timeout);
          clearTimeout(absoluteMaxTimeout);
          clearInterval(activityInterval);
          clearInterval(healthCheckInterval);
          
          if (exitDueToUpgrade) {
            console.log('[aider] Aider has upgraded. Restarting with new version...');
            if (progressCallback) {
              progressCallback('restarting', { reason: 'upgrade' });
            }
            
            // Simply restart the process with the same args
            console.log('[aider] Restarting Aider after upgrade...');
            const restartProcess = spawn('aider', args, {
              cwd: issueDir,
              env: processEnv,
              stdio: ['pipe', 'pipe', 'pipe']
            });
            
            // Use the same handlers for the restarted process
            // This is simplified; in a real implementation you might want to 
            // extract the process handling to a separate function
            let restartOutput = '';
            
            restartProcess.stdout.on('data', (data) => {
              const chunk = data.toString();
              restartOutput += chunk;
              console.log(`[aider-restart] ${chunk}`);
              
              if (progressCallback) {
                progressCallback('output', { output: chunk });
              }
            });
            
            restartProcess.stderr.on('data', (data) => {
              const chunk = data.toString();
              console.error(`[aider-restart-err] ${chunk}`);
              
              if (progressCallback) {
                progressCallback('error', { error: chunk });
              }
            });
            
            restartProcess.on('close', (restartCode) => {
              console.log(`[aider] Restart process exited with code ${restartCode}`);
              resolve(restartCode ?? 0);
            });
            
            return;
          }
          
          console.log(`[aider] Process exited with code ${code}`);
          resolve(code ?? 0);
        });
      });
      
      console.log(`Aider exited with code ${exitCode}`);
      if (progressCallback) {
        progressCallback('aider_complete', { exitCode });
      }
      
      // Get list of files that were modified
      const afterFiles = await this.getTrackedFiles(issueDir);
      const stagedChanges = await this.getStagedChanges(issueDir);
      
      // Check if there were any changes
      if (stagedChanges.length === 0) {
        console.log('No changes made by aider.');
        if (progressCallback) {
          progressCallback('no_changes', {});
        }
        return {
          success: false,
          message: 'No changes made. The AI couldn\'t find a solution or encountered an error.',
          changes: [],
          branchName: uniqueBranchName
        };
      }
      
      // Stage all changes before committing
      console.log('Staging changes...');
      if (progressCallback) {
        progressCallback('staging', {});
      }
      await this.executeCommand('git', ['add', '.']);
      
      // Commit changes
      console.log('Committing changes...');
      if (progressCallback) {
        progressCallback('committing', {});
      }
      
      // Create commit message with issue reference
      const issueReference = issueNumber ? ` #${issueNumber}` : '';
      const commitMessage = `Fix: ${issueTitle}${issueReference}\n\nAuto-generated fix by patchmycode.`;
      
      await this.executeCommand('git', ['commit', '-m', commitMessage]);
      
      // Push the changes
      console.log('Pushing changes...');
      if (progressCallback) {
        progressCallback('pushing', {});
      }
      await this.executeCommand('git', ['push', '--set-upstream', 'origin', uniqueBranchName]);
      
      // Get the list of changed files
      const changedFiles = stagedChanges.map(line => {
        const parts = line.split('\t');
        return parts[parts.length - 1];
      });
      
      console.log(`Changes made to ${changedFiles.length} files:`, changedFiles);
      if (progressCallback) {
        progressCallback('complete', { files: changedFiles });
      }
      
      return {
        success: true,
        message: 'Successfully applied changes to fix the issue.',
        changes: changedFiles,
        branchName: uniqueBranchName
      };
    } catch (error) {
      console.error('Error fixing issue:', error);
      if (progressCallback) {
        progressCallback('error', { 
          message: error instanceof Error ? error.message : String(error)
        });
      }
      return {
        success: false,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        changes: [],
        branchName: undefined
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
        // Kill any potentially running Aider processes 
        try {
          // On Unix-like systems, list processes related to Aider
          if (process.platform !== 'win32') {
            console.log('Checking for stray Aider processes...');
            const { stdout } = await execPromise('ps aux | grep aider | grep -v grep');
            
            if (stdout.trim()) {
              console.log('Found potentially stray Aider processes. Attempting cleanup.');
              // Kill any Aider processes still running 
              await execPromise('pkill -f aider').catch(() => {
                // Ignore errors if no processes were found to kill
              });
            }
          }
        } catch (error) {
          // Ignore errors when checking for processes
          console.log('No stray Aider processes found.');
        }
        
        await fs.promises.rm(this.tempDir, { recursive: true, force: true });
        console.log(`Cleaned up temporary directory: ${this.tempDir}`);
        this.tempDir = null;
      } catch (error) {
        console.error('Error cleaning up temporary directory:', error);
      }
    }
  }
}