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
  googleApiKey?: string;
  qwenApiKey?: string;
  deepseekApiKey?: string;
  codestralApiKey?: string;
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
      anthropicApiKey: options.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
      googleApiKey: options.googleApiKey || process.env.GOOGLE_API_KEY,
      qwenApiKey: options.qwenApiKey || process.env.QWEN_API_KEY,
      deepseekApiKey: options.deepseekApiKey || process.env.DEEPSEEK_API_KEY,
      codestralApiKey: options.codestralApiKey || process.env.CODESTRAL_API_KEY
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
   * Check if the configured model is a Google Gemini model
   */
  private isGeminiModel(): boolean {
    return !!this.options.model && (
      this.options.model.toLowerCase().includes('gemini') ||
      this.options.model.toLowerCase().includes('google')
    );
  }

  /**
   * Check if the configured model is a Qwen model
   */
  private isQwenModel(): boolean {
    return !!this.options.model && (
      this.options.model.toLowerCase().includes('qwen')
    );
  }

  /**
   * Check if the configured model is a Deepseek model
   */
  private isDeepseekModel(): boolean {
    return !!this.options.model && (
      this.options.model.toLowerCase().includes('deepseek')
    );
  }

  /**
   * Check if the configured model is a Codestral model
   */
  private isCodestralModel(): boolean {
    return !!this.options.model && (
      this.options.model.toLowerCase().includes('codestral')
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
      
      // Add model-specific flags
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
      } else if (this.isGeminiModel()) {
        console.log('Using Google Gemini model');
        
        // Check if Gemini flag is already present in extra args
        const hasGeminiFlag = this.options.extraArgs?.some(arg => 
          arg === '--use-gemini' || 
          arg === '--gemini'
        );
        
        // Only add the flag if not already present
        if (!hasGeminiFlag) {
          aiderArgs.push('--gemini');
        }
      } else if (this.isQwenModel()) {
        console.log('Using Qwen model');
        
        // Check if Qwen flag is already present in extra args
        const hasQwenFlag = this.options.extraArgs?.some(arg => 
          arg === '--use-qwen' || 
          arg === '--qwen'
        );
        
        // Only add the flag if not already present
        if (!hasQwenFlag) {
          aiderArgs.push('--qwen');
        }
      } else if (this.isDeepseekModel()) {
        console.log('Using Deepseek model');
        
        // Check if Deepseek flag is already present in extra args
        const hasDeepseekFlag = this.options.extraArgs?.some(arg => 
          arg === '--use-deepseek' || 
          arg === '--deepseek'
        );
        
        // Only add the flag if not already present
        if (!hasDeepseekFlag) {
          aiderArgs.push('--deepseek');
        }
      } else if (this.isCodestralModel()) {
        console.log('Using Codestral model');
        
        // Check if Codestral flag is already present in extra args
        const hasCodestralFlag = this.options.extraArgs?.some(arg => 
          arg === '--use-codestral' || 
          arg === '--codestral'
        );
        
        // Only add the flag if not already present
        if (!hasCodestralFlag) {
          aiderArgs.push('--codestral');
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
      } else if (this.isGeminiModel()) {
        // For Gemini models, ensure the Google API key is set
        if (this.options.googleApiKey) {
          env.GOOGLE_API_KEY = this.options.googleApiKey;
          console.log('Using Google API key from options for Gemini model');
        } else if (env.GOOGLE_API_KEY) {
          console.log('Using Google API key from environment for Gemini model');
        } else {
          console.log('WARNING: Using Gemini model but no Google API key found!');
        }
        
        // Some Aider versions might still check for OpenAI API key
        if (!env.OPENAI_API_KEY) {
          env.OPENAI_API_KEY = 'not-needed-for-gemini';
          console.log('Set dummy OpenAI API key for compatibility with Gemini');
        }
      } else if (this.isQwenModel()) {
        // For Qwen models, ensure the Qwen API key is set
        if (this.options.qwenApiKey) {
          env.QWEN_API_KEY = this.options.qwenApiKey;
          console.log('Using Qwen API key from options');
        } else if (env.QWEN_API_KEY) {
          console.log('Using Qwen API key from environment');
        } else {
          console.log('WARNING: Using Qwen model but no Qwen API key found!');
        }
        
        // Some Aider versions might still check for OpenAI API key
        if (!env.OPENAI_API_KEY) {
          env.OPENAI_API_KEY = 'not-needed-for-qwen';
          console.log('Set dummy OpenAI API key for compatibility with Qwen');
        }
      } else if (this.isDeepseekModel()) {
        // For Deepseek models, ensure the Deepseek API key is set
        if (this.options.deepseekApiKey) {
          env.DEEPSEEK_API_KEY = this.options.deepseekApiKey;
          console.log('Using Deepseek API key from options');
        } else if (env.DEEPSEEK_API_KEY) {
          console.log('Using Deepseek API key from environment');
        } else {
          console.log('WARNING: Using Deepseek model but no Deepseek API key found!');
        }
        
        // Some Aider versions might still check for OpenAI API key
        if (!env.OPENAI_API_KEY) {
          env.OPENAI_API_KEY = 'not-needed-for-deepseek';
          console.log('Set dummy OpenAI API key for compatibility with Deepseek');
        }
      } else if (this.isCodestralModel()) {
        // For Codestral models, ensure the Codestral API key is set
        if (this.options.codestralApiKey) {
          env.CODESTRAL_API_KEY = this.options.codestralApiKey;
          console.log('Using Codestral API key from options');
        } else if (env.CODESTRAL_API_KEY) {
          console.log('Using Codestral API key from environment');
        } else {
          console.log('WARNING: Using Codestral model but no Codestral API key found!');
        }
        
        // Some Aider versions might still check for OpenAI API key
        if (!env.OPENAI_API_KEY) {
          env.OPENAI_API_KEY = 'not-needed-for-codestral';
          console.log('Set dummy OpenAI API key for compatibility with Codestral');
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
      console.log('- GOOGLE_API_KEY:', env.GOOGLE_API_KEY ? 'Set' : 'Not set');
      console.log('- QWEN_API_KEY:', env.QWEN_API_KEY ? 'Set' : 'Not set');
      console.log('- DEEPSEEK_API_KEY:', env.DEEPSEEK_API_KEY ? 'Set' : 'Not set');
      console.log('- CODESTRAL_API_KEY:', env.CODESTRAL_API_KEY ? 'Set' : 'Not set');
      
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
      const fullError = errorMessage; // Keep the full error for logging
      
      // Log the full error for debugging
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
      } else if (errorMessage.includes('GOOGLE_API_KEY') ||
                 errorMessage.includes('google.auth') ||
                 errorMessage.includes('gemini')) {
        errorMessage = 'Google API key is missing or invalid. Please set the GOOGLE_API_KEY environment variable.';
      } else if (errorMessage.includes('QWEN_API_KEY') ||
                 errorMessage.includes('qwen.auth') ||
                 errorMessage.includes('qwen.api_key')) {
        errorMessage = 'Qwen API key is missing or invalid. Please set the QWEN_API_KEY environment variable.';
      } else if (errorMessage.includes('DEEPSEEK_API_KEY') ||
                 errorMessage.includes('deepseek.auth') ||
                 errorMessage.includes('deepseek.api_key')) {
        errorMessage = 'Deepseek API key is missing or invalid. Please set the DEEPSEEK_API_KEY environment variable.';
      } else if (errorMessage.includes('CODESTRAL_API_KEY') ||
                 errorMessage.includes('codestral.auth') ||
                 errorMessage.includes('codestral.api_key')) {
        errorMessage = 'Codestral API key is missing or invalid. Please set the CODESTRAL_API_KEY environment variable.';
      } else if (errorMessage.includes('ENOENT') && errorMessage.includes('aider')) {
        errorMessage = 'Aider executable not found. Please install Aider with: pip install aider-chat';
      } else if (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('timeout')) {
        errorMessage = `Aider operation timed out after ${this.options.timeout ? this.options.timeout / 1000 : 300} seconds`;
      } else if (errorMessage.includes('unrecognized arguments')) {
        errorMessage = `Aider command line error: ${errorMessage}\n\nThis may be due to version differences. Try updating Aider: pip install -U aider-chat`;
      }
      
      // Add model-specific troubleshooting advice
      if (this.isClaudeModel()) {
        errorMessage += '\n\nAdditional Claude troubleshooting:\n' +
          '• Make sure ANTHROPIC_API_KEY is set and valid\n' +
          '• Try different flags for Claude in AIDER_EXTRA_ARGS (--anthropic or --claude)\n' +
          '• Check Aider version compatibility with Claude models';
      } else if (this.isGeminiModel()) {
        errorMessage += '\n\nAdditional Gemini troubleshooting:\n' +
          '• Make sure GOOGLE_API_KEY is set and valid\n' +
          '• Try different flags for Gemini in AIDER_EXTRA_ARGS (--gemini)\n' +
          '• Check Aider version compatibility with Gemini models\n' +
          '• Ensure you have the latest version of Aider: pip install -U aider-chat';
      } else if (this.isQwenModel()) {
        errorMessage += '\n\nAdditional Qwen troubleshooting:\n' +
          '• Make sure QWEN_API_KEY is set and valid\n' +
          '• Try different flags for Qwen in AIDER_EXTRA_ARGS (--qwen)\n' +
          '• Check Aider version compatibility with Qwen models\n' +
          '• Ensure you have the latest version of Aider: pip install -U aider-chat';
      } else if (this.isDeepseekModel()) {
        errorMessage += '\n\nAdditional Deepseek troubleshooting:\n' +
          '• Make sure DEEPSEEK_API_KEY is set and valid\n' +
          '• Try different flags for Deepseek in AIDER_EXTRA_ARGS (--deepseek)\n' +
          '• Check Aider version compatibility with Deepseek models\n' +
          '• Ensure you have the latest version of Aider: pip install -U aider-chat';
      } else if (this.isCodestralModel()) {
        errorMessage += '\n\nAdditional Codestral troubleshooting:\n' +
          '• Make sure CODESTRAL_API_KEY is set and valid\n' +
          '• Try different flags for Codestral in AIDER_EXTRA_ARGS (--codestral)\n' +
          '• Check Aider version compatibility with Codestral models\n' +
          '• Ensure you have the latest version of Aider: pip install -U aider-chat';
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
