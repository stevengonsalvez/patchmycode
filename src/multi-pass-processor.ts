import * as path from 'path';
import { PatchClient, PatchOptions } from './patch.js';
import { ModeSelector, ModeSelectionResult, AiderMode } from './mode-selector.js';
import { GitHubClient } from './github.js';
import config from './config.js';

export interface MultiPassResult {
  success: boolean;
  changes: string[];
  message: string;
  modesUsed: AiderMode[];
  badges: string[];
}

export interface ProcessResult {
  success: boolean;
  message: string;
  changes: string[];
  modesUsed: string[];
  branchName?: string;
}

/**
 * The MultiPassProcessor class handles running multiple passes of Aider
 * with different modes to comprehensively address complex issues
 */
export class MultiPassProcessor {
  private modeSelector: ModeSelector;
  
  constructor(modeSelector: ModeSelector) {
    this.modeSelector = modeSelector;
  }
  
  /**
   * Process an issue using one or more modes based on labels
   */
  async process(
    repoUrl: string,
    issueTitle: string,
    issueBody: string,
    issueLabels: string[],
    baseBranchName: string,
    github: GitHubClient,
    authToken?: string
  ): Promise<ProcessResult> {
    // Determine the appropriate mode based on issue labels
    const modeResult = this.modeSelector.selectModeFromLabels(issueLabels);
    let modesUsed: string[] = [];
    
    // If no specific mode was determined, use the default mode
    if (!modeResult) {
      console.log(`No specific mode detected from labels. Using default mode: ${config.defaultMode}`);
      modesUsed = [config.defaultMode];
      return this.processSingleMode(
        repoUrl,
        issueTitle,
        issueBody,
        config.defaultMode,
        baseBranchName,
        authToken
      );
    }
    
    console.log(`Detected mode from labels: ${modeResult.primaryMode}`);
    
    // Check if this is a multi-pass scenario
    if (modeResult.needsMultiPass && config.enableMultiPass) {
      console.log(`Using multi-pass approach with modes: ${modeResult.primaryMode} -> ${modeResult.secondaryMode}`);
      return this.processMultiPass(
        repoUrl,
        issueTitle,
        issueBody,
        modeResult,
        baseBranchName,
        github,
        authToken
      );
    }
    
    // Single mode processing
    return this.processSingleMode(
      repoUrl,
      issueTitle,
      issueBody,
      modeResult.primaryMode,
      baseBranchName,
      authToken
    );
  }
  
  /**
   * Process an issue with a single mode
   */
  private async processSingleMode(
    repoUrl: string,
    issueTitle: string,
    issueBody: string,
    mode: string,
    baseBranchName: string,
    authToken?: string
  ): Promise<ProcessResult> {
    console.log(`Processing with single mode: ${mode}`);
    
    // Create mode-specific branch name
    const branchName = `${mode}-${baseBranchName}`;
    
    // Configure patch options
    const patchOptions: PatchOptions = {
      timeout: config.patchTimeout,
      model: this.modeSelector.getModelForMode(mode) || config.model,
      extraArgs: config.extraArgs,
      mode: mode
    };
    
    // Initialize patch client
    const patcher = new PatchClient(patchOptions);
    await patcher.init();
    
    // Run patcher to fix the issue
    try {
      const result = await patcher.fixIssue(
        repoUrl,
        issueTitle,
        issueBody,
        branchName,
        authToken,
        undefined, // baseBranch
        this.createProgressCallbackHandler(mode) // Add progress callback
      );
      
      return {
        success: result.success,
        message: result.message,
        changes: result.changes,
        modesUsed: [mode],
        branchName: branchName
      };
    } catch (error) {
      console.error(`Error in ${mode} mode processing:`, error);
      return {
        success: false,
        message: `Failed during ${mode} mode: ${error instanceof Error ? error.message : String(error)}`,
        changes: [],
        modesUsed: [mode],
        branchName: branchName
      };
    }
  }
  
  /**
   * Process an issue with multiple passes using different modes
   */
  private async processMultiPass(
    repoUrl: string,
    issueTitle: string,
    issueBody: string,
    modeResult: ModeSelectionResult,
    baseBranchName: string,
    github: GitHubClient,
    authToken?: string
  ): Promise<ProcessResult> {
    // Define the sequence of modes to use
    const primaryMode = modeResult.primaryMode;
    const secondaryMode = modeResult.secondaryMode || config.defaultMultiPassSequence[1];
    const modes = [primaryMode, secondaryMode];
    
    console.log(`Starting multi-pass processing with sequence: ${modes.join(' -> ')}`);
    
    try {
      // First pass: Apply the primary mode
      const primaryBranchName = `${primaryMode}-${baseBranchName}`;
      
      // Configure primary patch options
      const primaryPatchOptions: PatchOptions = {
        timeout: config.patchTimeout,
        model: this.modeSelector.getModelForMode(primaryMode) || config.model,
        extraArgs: config.extraArgs,
        mode: primaryMode
      };
      
      // Initialize primary patch client
      const primaryPatcher = new PatchClient(primaryPatchOptions);
      await primaryPatcher.init();
      
      // Run primary mode patcher
      const primaryResult = await primaryPatcher.fixIssue(
        repoUrl,
        issueTitle,
        issueBody,
        primaryBranchName,
        authToken,
        undefined, // baseBranch
        this.createProgressCallbackHandler(primaryMode) // Add progress callback
      );
      
      if (!primaryResult.success) {
        console.log(`Primary mode (${primaryMode}) failed: ${primaryResult.message}`);
        return {
          success: false,
          message: `Failed during ${primaryMode} mode: ${primaryResult.message}`,
          changes: primaryResult.changes,
          modesUsed: [primaryMode],
          branchName: primaryBranchName
        };
      }
      
      // Create a progress comment
      await github.addIssueComment(
        `✅ Step 1 completed: Changes applied with **${primaryMode}** mode.\n\n` +
        `Moving to step 2: Applying **${secondaryMode}** mode...`
      );
      
      // Second pass: Apply the secondary mode
      // Create a new branch based on the primary branch
      const finalBranchName = `${secondaryMode}-on-${primaryMode}-${baseBranchName}`;
      
      // Configure secondary patch options
      const secondaryPatchOptions: PatchOptions = {
        timeout: config.patchTimeout,
        model: this.modeSelector.getModelForMode(secondaryMode) || config.model,
        extraArgs: config.extraArgs,
        mode: secondaryMode
      };
      
      // Initialize secondary patch client
      const secondaryPatcher = new PatchClient(secondaryPatchOptions);
      await secondaryPatcher.init();
      
      // Create a context message for the secondary pass
      const contextMessage = 
        `This is a second pass after an initial ${primaryMode} pass. ` +
        `The first pass made architectural changes and refactoring. ` +
        `This ${secondaryMode} pass should focus on fine-tuning the implementation details ` +
        `and ensuring all requirements are met.`;
      
      // Run secondary mode patcher on the primary branch
      const secondaryResult = await secondaryPatcher.fixIssue(
        repoUrl,
        issueTitle,
        `${issueBody}\n\n---\n\n${contextMessage}`,
        finalBranchName,
        authToken,
        primaryBranchName,
        this.createProgressCallbackHandler(secondaryMode) // Add progress callback
      );
      
      // Combine the changes from both passes
      const allChanges = [...new Set([...primaryResult.changes, ...secondaryResult.changes])];
      
      if (!secondaryResult.success) {
        console.log(`Secondary mode (${secondaryMode}) failed: ${secondaryResult.message}`);
        return {
          success: false,
          message: `First pass (${primaryMode}) successful, but second pass (${secondaryMode}) failed: ${secondaryResult.message}`,
          changes: allChanges,
          modesUsed: modes,
          branchName: finalBranchName
        };
      }
      
      // Both passes succeeded
      return {
        success: true,
        message: `Successfully applied changes with ${primaryMode} followed by ${secondaryMode} modes`,
        changes: allChanges,
        modesUsed: modes,
        branchName: finalBranchName
      };
    } catch (error) {
      console.error(`Error in multi-pass processing:`, error);
      return {
        success: false,
        message: `Failed during multi-pass processing: ${error instanceof Error ? error.message : String(error)}`,
        changes: [],
        modesUsed: modes,
        branchName: undefined
      };
    }
  }

  /**
   * Creates a progress callback handler function for streaming Aider output to console
   */
  private createProgressCallbackHandler(mode: string): (status: string, data?: any) => void {
    let lastActivityTimestamp = Date.now();
    let stuckWarningIssued = false;
    
    return (status: string, data?: any) => {
      switch (status) {
        case 'starting':
          console.log(`🚀 [${mode}] Starting Aider process: ${data?.title || ''}`);
          break;
          
        case 'cloning':
          console.log(`📥 [${mode}] Cloning repository: ${data?.repo || ''}`);
          break;
          
        case 'checkout':
          console.log(`🔀 [${mode}] Checking out branch: ${data?.branch || ''}`);
          break;
          
        case 'branch':
          console.log(`🌿 [${mode}] Creating branch: ${data?.name || ''}`);
          break;
          
        case 'aider_start':
          console.log(`⚙️ [${mode}] Starting Aider with model: ${data?.model || ''}`);
          console.log(`   Mode: ${data?.mode || 'unknown'}`);
          lastActivityTimestamp = Date.now();
          break;
          
        case 'output':
          // Only log non-empty output that's not too long for readability
          if (data?.text && data.text.trim() && data.text.length < 500) {
            // Remove redundant newlines for cleaner logs
            const cleanedText = data.text.replace(/\n{3,}/g, '\n\n').trim();
            console.log(`🔄 [${mode}] ${cleanedText}`);
          }
          lastActivityTimestamp = Date.now();
          stuckWarningIssued = false;
          break;
          
        case 'url_detected':
          console.log(`🔗 [${mode}] URLs detected in Aider output:`);
          if (data?.urls && Array.isArray(data.urls)) {
            data.urls.forEach((url: string) => console.log(`   ${url}`));
          }
          lastActivityTimestamp = Date.now();
          break;
          
        case 'auto_response':
          console.log(`🤖 [${mode}] Auto-responded "${data?.response}" to Aider's "${data?.prompt}" prompt`);
          lastActivityTimestamp = Date.now();
          break;

        case 'health_check':
          console.log(`💓 [${mode}] Health check sent to Aider (inactive for ${data?.inactive_seconds || 0}s, check #${data?.consecutive_checks || 1})`);
          break;
          
        case 'forced_termination':
          console.error(`⚠️ [${mode}] Forcefully terminating Aider process: ${data?.reason || 'unknown reason'}`);
          console.error(`   Inactive for ${data?.inactive_seconds || 0} seconds`);
          break;
          
        case 'max_time_reached':
          console.error(`⏰ [${mode}] Maximum time limit of ${data?.minutes || 30} minutes reached. Force terminating Aider.`);
          break;
          
        case 'error':
          console.error(`❌ [${mode}] Error: ${data?.text || data?.message || 'Unknown error'}`);
          lastActivityTimestamp = Date.now();
          break;
          
        case 'status':
          if (data?.status === 'working') {
            const inactiveSeconds = data?.inactive_seconds || 0;
            // Check if Aider might be stuck
            if (inactiveSeconds > 120 && !stuckWarningIssued) { // 2 minutes of inactivity
              console.warn(`⚠️ [${mode}] Warning: Aider has been inactive for ${inactiveSeconds} seconds, it may be stuck`);
              console.warn(`   Last output: ${data?.last_output || 'none'}`);
              stuckWarningIssued = true;
            }
          } else {
            console.log(`ℹ️ [${mode}] Status: ${data?.status || 'unknown'}`);
            lastActivityTimestamp = Date.now();
            stuckWarningIssued = false;
          }
          break;
          
        case 'timeout':
          console.warn(`⏰ [${mode}] Timeout reached after ${data?.seconds || 'unknown'} seconds`);
          break;
          
        case 'aider_complete':
          console.log(`✅ [${mode}] Aider completed with exit code: ${data?.exitCode}`);
          break;
          
        case 'no_changes':
          console.log(`ℹ️ [${mode}] No changes were made by Aider`);
          break;
          
        case 'committing':
          console.log(`📝 [${mode}] Committing changes`);
          break;
          
        case 'pushing':
          console.log(`📤 [${mode}] Pushing changes to remote`);
          break;
          
        case 'complete':
          console.log(`🎉 [${mode}] Processing complete with ${data?.files?.length || 0} changed files`);
          if (data?.files?.length > 0) {
            console.log(`   Changed files: ${data.files.join(', ')}`);
          }
          break;
          
        default:
          // For any other events, just log them with data
          console.log(`[${mode}] ${status}: ${JSON.stringify(data || {})}`);
      }
    };
  }
}