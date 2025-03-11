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
      
      console.log(`Creating new branch: ${branchName}`);
      if (progressCallback) {
        progressCallback('branch', { name: branchName });
      }
      await this.executeCommand('git', ['checkout', '-b', branchName]);
      
      // Create a temporary file with the issue details
      const issueFile = path.join(issueDir, 'ISSUE.md');
      await fs.promises.writeFile(issueFile, `# ${issueTitle}\n\n${issueBody}`);
      
      // Get baseline list of files
      const beforeFiles = await this.getTrackedFiles(issueDir);
      
      // Prepare args for aider
      const model = this.getModelForCurrentMode();
      const extraArgs = this.getExtraArgsForCurrentMode();
      
      let args = [
        '--model', model,
        ...this.getModeArgs(),
        ...extraArgs,
        '--message', `# ${issueTitle}\n\n${issueBody}`
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
      
      // Run aider with a timeout
      const aiderProcess = spawn('aider', args, {
        cwd: issueDir,
        stdio: 'pipe',
        env: processEnv
      });
      
      // Helper function to send input to aider process with proper newline and flush
      const sendInputToAider = (input: string): Promise<void> => {
        return new Promise<void>((resolve, reject) => {
          // Add a slight delay to avoid racing with Aider's prompt processing
          setTimeout(() => {
            try {
              // Make sure input always ends with a newline
              const formattedInput = input.endsWith('\n') ? input : `${input}\n`;
              
              // Check if there's already text typed in the prompt (backspace and clear it first)
              if (input === 'y' || input === 'n') {
                // Send backspace and then our intended input (clears any potential existing input)
                const backspace = '\b'.repeat(10); // Multiple backspaces to clear any existing input
                aiderProcess.stdin.write(backspace, 'utf8', () => {
                  console.log('[aider] Cleared input field before sending response');
                  
                  // Now write the actual input
                  const success = aiderProcess.stdin.write(formattedInput, 'utf8', () => {
                    // This callback ensures the write is completed
                    aiderProcess.stdin.write('', () => {
                      resolve();
                    });
                  });
                  
                  if (!success) {
                    console.error('[aider] Failed to write to stdin!');
                    reject(new Error('Failed to write to stdin'));
                  }
                });
              } else {
                // Normal path for non-yes/no inputs
                // Write the input to stdin
                const success = aiderProcess.stdin.write(formattedInput, 'utf8', () => {
                  // This callback ensures the write is completed
                  aiderProcess.stdin.write('', () => {
                    resolve();
                  });
                });
                
                if (!success) {
                  console.error('[aider] Failed to write to stdin!');
                  reject(new Error('Failed to write to stdin'));
                }
              }
            } catch (error) {
              console.error('[aider] Error sending input:', error);
              reject(error);
            }
          }, 100); // Small delay to ensure prompt is fully displayed
        });
      };

      let textOutput = '';
      let stderr = '';
      
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
        const chunk = data.toString();
        textOutput += chunk;
        console.log(`[aider] ${chunk}`);
        
        // Update activity timestamp
        lastActivity = Date.now();
        consecutiveHealthChecks = 0; // Reset health check counter on any output
        
        // Track if we've handled a prompt in this data chunk to avoid multiple responses
        let hasHandledPrompt = false;
        
        // Critical section for "Edit the files?" prompt - use very aggressive detection
        if (!hasHandledPrompt &&
            (chunk.includes('Edit the files?') || 
             chunk.includes('edit the files') || 
             /\bedit.*\bfiles/i.test(chunk) ||
             chunk.includes('Edit files?')) && 
             (chunk.includes('(Y)') || chunk.includes('[Yes]') || chunk.includes('Y/N'))) {
          
          // Mark that we've handled a prompt in this chunk
          hasHandledPrompt = true;
          
          // Check if there's an 'n' response already in the same chunk
          // This indicates that the prompt has already been answered negatively
          if (chunk.match(/Edit the files\?\s*.*?\s*n$/i) ||
              chunk.match(/Edit files\?\s*.*?\s*n$/i) ||
              chunk.match(/\(Y\)es\/\(N\)o\s*.*?\s*n$/i)) {
            console.log(''); 
            console.log('⚠️ WARNING: Detected "n" response already in the same chunk as edit prompt!');
            console.log('⚠️ Attempting to override with forced "y" response...');
            
            // Send multiple backspaces to clear the 'n', then send 'y'
            try {
              // First send 10 backspaces to clear any input
              aiderProcess.stdin.write('\b'.repeat(10));
              // Force through with a y and newline
              aiderProcess.stdin.write('y\n');
              console.log('✅ Sent backspaces and override "y" response');
              
              if (progressCallback) {
                progressCallback('auto_response', { 
                  prompt: 'CRITICAL_EDIT_FILES_OVERRIDE', 
                  response: 'y', 
                  text: 'Overrode n with y' 
                });
              }
            } catch (err) {
              console.error('[aider] Failed to override negative response:', err);
            }
          } else {
            console.log('');
            console.log('==================================================================');
            console.log('🚨 CRITICAL EDIT PROMPT DETECTED - RESPONDING WITH FORCE "YES" 🚨');
            console.log('==================================================================');
            console.log('');
            
            // Force a response directly to stdin with newline and flush
            try {
              // Use a single response method to avoid race conditions
              console.log('[aider] Sending YES response to edit files prompt');
              
              // Use the controlled helper function
              sendInputToAider('y')
                .then(() => console.log('[aider] YES response sent successfully'))
                .catch(err => {
                  console.error('[aider] Failed to send YES response:', err);
                  
                  // Only try the direct approach as a fallback
                  try {
                    console.log('[aider] Falling back to direct stdin write');
                    aiderProcess.stdin.write('y\n');
                  } catch (fallbackErr) {
                    console.error('[aider] Even fallback failed:', fallbackErr);
                  }
                });
              
              if (progressCallback) {
                progressCallback('auto_response', { prompt: 'CRITICAL_EDIT_FILES', response: 'y', text: chunk.trim() });
              }
            } catch (err) {
              console.error('[aider] CRITICAL ERROR: Failed to handle edit files prompt:', err);
            }
          }
          
          // Skip other prompt handlers for this chunk to avoid conflicting responses
          return;
        }
        
        // Define a function to handle prompt responses to avoid duplicate responses
        let promptHandled = false;
        const handlePrompt = (
          pattern: string | RegExp | ((str: string) => boolean), 
          response: string | ((str: string) => string), 
          promptType: string
        ) => {
          // Skip if we've already handled a prompt in this chunk or this pattern
          if (hasHandledPrompt || promptHandled) return false;
          
          let matches = false;
          if (typeof pattern === 'string') {
            matches = chunk.includes(pattern);
          } else if (pattern instanceof RegExp) {
            matches = pattern.test(chunk);
          } else if (typeof pattern === 'function') {
            matches = pattern(chunk);
          }
          
          if (matches) {
            // Get response (either static string or dynamic based on the chunk)
            const responseText = typeof response === 'function' ? response(chunk) : response;
            
            // Mark as handled to prevent other handlers from firing
            promptHandled = true;
            hasHandledPrompt = true;
            
            // Use the new helper function to send input reliably
            sendInputToAider(responseText)
              .then(() => {
                console.log(`[aider] Auto-responded "${responseText}" to ${promptType} prompt: ${chunk.trim()}`);
              })
              .catch(err => {
                console.error(`[aider] Failed to send "${responseText}" response:`, err);
              });
            
            if (progressCallback) {
              progressCallback('auto_response', { prompt: promptType, response: responseText, text: chunk.trim() });
            }
            return true;
          }
          return false;
        };
        
        // Check for specific patterns to report progress
        if (progressCallback) {
          if (chunk.includes('Sending request')) {
            progressCallback('status', { status: 'thinking' });
          } else if (chunk.includes('Committing')) {
            progressCallback('status', { status: 'committing' });
          } else if (chunk.includes('Applying changes')) {
            progressCallback('status', { status: 'applying' });
          } else if (/Changes to [0-9]+ files/.test(chunk)) {
            progressCallback('status', { status: 'changes_detected' });
          }
        }
        
        // If we've already handled a prompt in this chunk, skip the rest
        if (hasHandledPrompt) {
          console.log('[aider] Already handled a prompt in this chunk, skipping other handlers');
        } else {
          // Regular prompt handling
          // Critical edit prompts - ALWAYS YES
          handlePrompt('Edit the files?', 'y', 'edit_files');
          handlePrompt('edit the files', 'y', 'edit_files_alt');
          handlePrompt('Apply suggested changes?', 'y', 'apply_changes');
          handlePrompt('apply changes', 'y', 'apply_changes_alt');
          handlePrompt('Save changes?', 'y', 'save_changes');
          handlePrompt('save changes', 'y', 'save_changes_alt');
          
          // URL-related prompts - NO
          handlePrompt('Clone repo:', 'n', 'clone_repo');
          handlePrompt('Open this URL?', 'n', 'open_url');
          handlePrompt('open link', 'n', 'open_link');
          handlePrompt('Open browser?', 'n', 'open_browser');
          
          // File-related prompts
          handlePrompt('Add file to the chat?', 'n', 'add_file');
          
          // Upgrade prompts
          handlePrompt('Do you want to upgrade?', 'n', 'upgrade');
          handlePrompt('Run pip install?', 'n', 'pip_install');
          handlePrompt('Newer aider version', 'n', 'version_notice');
          
          // Permission-related prompts
          handlePrompt('Do you want to allow', 'n', 'permission');
          handlePrompt('Would you like me to', 'n', 'permission_alt');
          
          // Stage/commit prompts
          handlePrompt('Stage these changes?', 'y', 'stage_changes');
          handlePrompt('Commit staged changes?', 'y', 'commit_changes');
          handlePrompt('stage changes', 'y', 'stage_changes_alt');
          
          // Continue/proceed prompts
          handlePrompt('continue?', 'y', 'continue');
          handlePrompt('proceed?', 'y', 'proceed');
          
          // Generic question detection with dynamic response
          handlePrompt(
            (str: string) => {
              // Is this a question that ends with ? and is about editing files?
              if (str.trim().endsWith('?')) {
                const lowerStr = str.toLowerCase();
                return lowerStr.includes('edit') && 
                       (lowerStr.includes('file') || lowerStr.includes('change'));
              }
              return false;
            },
            (str: string) => {
              console.log('[aider] Detected generic edit question:', str.trim());
              return 'y';
            },
            'generic_edit_question'
          );
          
          // Generic yes/no question with a default of "no"
          handlePrompt(
            (str: string) => str.includes('(Y/N)') || (str.includes('[') && str.includes(']')),
            (str: string) => {
              const lowerStr = str.toLowerCase();
              // Say 'y' for anything to do with editing, saving, or applying changes
              if (lowerStr.includes('edit') || lowerStr.includes('save') || 
                  lowerStr.includes('change') || lowerStr.includes('apply')) {
                console.log('[aider] Defaulting to YES for edit/save/change prompt');
                return 'y';
              } else {
                console.log('[aider] Defaulting to NO for prompt:', str.trim());
                return 'n';
              }
            },
            'generic_question'
          );
          
          // Catch-all for other patterns
          handlePrompt(/\[Yes\]:(\s*)$/, 'y', 'default_yes');
          handlePrompt(/\[[^\]]+\]:(\s*)$/, 'n', 'prompt_with_brackets');
          handlePrompt(/\([YN]\)(\s*)$/, 'n', 'yn_choice');
          handlePrompt(/\(Y\/n\)(\s*)$/, 'y', 'yes_default');
          handlePrompt(/\(y\/N\)(\s*)$/, 'n', 'no_default');
          handlePrompt(/\(yes\/no\)(\s*)$/, 'n', 'generic_choice');
          handlePrompt(/\[No\]:(\s*)$/, 'n', 'default_no');
        }
        
        // Publish to progress
        if (progressCallback) {
          progressCallback('output', { text: chunk });
        }
        
        // Check for exit conditions
        if (chunk.includes('I\'ll help you')) {
          initialPromptReceived = true;
        }
        
        if (chunk.includes('Commit staged changes? (Y)es/(N)o [Yes]:')) {
          console.log('[aider] Detected commit prompt, exiting soon.');
          exitConditionMet = true;
        }
        
        if (chunk.includes('Goodbye!') || chunk.includes('Exiting')) {
          console.log('[aider] Detected goodbye message, exiting.');
          exitConditionMet = true;
        }
      });
      
      // Setup a health check interval to verify process is still responsive
      const healthCheckInterval = setInterval(() => {
        // If process is still running but not accepting input, this could be a sign of being stuck
        if (aiderProcess.stdin.writable) {
          // Only send a newline if there's been no activity for a while
          const inactiveSecs = (Date.now() - lastActivity) / 1000;
          if (inactiveSecs > 60) { // More than a minute of inactivity
            try {
              // Sending a newline can sometimes unstick the process or at least trigger some output
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
              }
            } catch (error) {
              console.error('[aider] Error sending health check input:', error);
            }
          }
        }
      }, 60000); // Check every minute
      
      aiderProcess.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        console.error(`[aider-err] ${chunk}`);
        
        // Update activity timestamp
        lastActivity = Date.now();
        
        // Send error updates if callback exists
        if (progressCallback && chunk.trim()) {
          progressCallback('error', { text: chunk });
        }
      });
      
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
          resolve(code || 0);
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
          changes: []
        };
      }
      
      // Commit changes
      console.log('Committing changes...');
      if (progressCallback) {
        progressCallback('committing', {});
      }
      await this.executeCommand('git', ['commit', '-m', `Fix: ${issueTitle}\n\nAuto-generated fix by patchmycode.`]);
      
      // Push the changes
      console.log('Pushing changes...');
      if (progressCallback) {
        progressCallback('pushing', {});
      }
      await this.executeCommand('git', ['push', '--set-upstream', 'origin', branchName]);
      
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
        changes: changedFiles
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
