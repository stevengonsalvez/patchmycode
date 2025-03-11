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
        authToken
      );
      
      return {
        success: result.success,
        message: result.message,
        changes: result.changes,
        modesUsed: [mode]
      };
    } catch (error) {
      console.error(`Error in ${mode} mode processing:`, error);
      return {
        success: false,
        message: `Failed during ${mode} mode: ${error instanceof Error ? error.message : String(error)}`,
        changes: [],
        modesUsed: [mode]
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
        authToken
      );
      
      if (!primaryResult.success) {
        console.log(`Primary mode (${primaryMode}) failed: ${primaryResult.message}`);
        return {
          success: false,
          message: `Failed during ${primaryMode} mode: ${primaryResult.message}`,
          changes: primaryResult.changes,
          modesUsed: [primaryMode]
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
        primaryBranchName
      );
      
      // Combine the changes from both passes
      const allChanges = [...new Set([...primaryResult.changes, ...secondaryResult.changes])];
      
      if (!secondaryResult.success) {
        console.log(`Secondary mode (${secondaryMode}) failed: ${secondaryResult.message}`);
        return {
          success: false,
          message: `First pass (${primaryMode}) successful, but second pass (${secondaryMode}) failed: ${secondaryResult.message}`,
          changes: allChanges,
          modesUsed: modes
        };
      }
      
      // Both passes succeeded
      return {
        success: true,
        message: `Successfully applied changes with ${primaryMode} followed by ${secondaryMode} modes`,
        changes: allChanges,
        modesUsed: modes
      };
    } catch (error) {
      console.error(`Error in multi-pass processing:`, error);
      return {
        success: false,
        message: `Failed during multi-pass processing: ${error instanceof Error ? error.message : String(error)}`,
        changes: [],
        modesUsed: modes
      };
    }
  }
} 