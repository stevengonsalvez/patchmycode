import { Probot } from 'probot';
import { PatchClient, PatchOptions } from './patch.js';
import { GitHubClient } from './github.js';
import { ModeSelector } from './mode-selector.js';
import { MultiPassProcessor } from './multi-pass-processor.js';
import config from './config.js';

export default (app: Probot) => {
  // Listen for issue comment commands
  app.on('issue_comment.created', async (context) => {
    const github = new GitHubClient(context);
    const comment = context.payload.comment.body;
    
    // Check if this is a command comment
    if (comment.startsWith('/mode') || comment.startsWith('/analyze')) {
      try {
        const issueDetails = github.getIssueDetails();
        
        // Create mode selector
        const modeSelector = new ModeSelector();
        
        if (comment.startsWith('/analyze')) {
          // Analyze the issue for best mode
          const analysisResult = modeSelector.analyzeIssueForMode(issueDetails);
          
          // Respond with analysis
          await github.addIssueComment(
            `## Issue Analysis\n\n` +
            `I've analyzed this issue and recommend using **${analysisResult.primaryMode}** mode.\n\n` +
            `${analysisResult.needsMultiPass ? 
              `This issue would benefit from a multi-pass approach with **${analysisResult.primaryMode}** followed by **${analysisResult.secondaryMode}** mode.` : 
              `This issue can be addressed with a single-pass approach.`}\n\n` +
            `To apply this recommendation, comment:\n` +
            `\`\`\`\n/fix\n\`\`\``
          );
        } else if (comment.startsWith('/mode')) {
          // Set the mode based on the command
          const modeResult = modeSelector.selectModeFromCommand(comment);
          
          if (modeResult) {
            await github.addIssueComment(
              `Mode set to **${modeResult.primaryMode}**${modeResult.secondaryMode ? ` with secondary mode **${modeResult.secondaryMode}**` : ''}.\n\n` +
              `To start fixing with this mode, comment:\n` +
              `\`\`\`\n/fix\n\`\`\``
            );
            
            // Store the mode selection in the repository for this issue
            // This would typically be done by creating a .patchmycode/issue-{num}.json file
            // But for simplicity, we'll skip the implementation here
          } else {
            await github.addIssueComment(
              `Invalid mode command. Available modes are:\n` +
              `- \`/mode architect\` - For architectural changes\n` +
              `- \`/mode patcher\` - For targeted bug fixes\n` +
              `- \`/mode hybrid:security\` - For security-focused fixes\n` +
              `- \`/mode hybrid:performance\` - For performance optimizations\n` +
              `- \`/mode multipass\` - For combined architect+patcher approach`
            );
          }
        } else if (comment === '/fix') {
          await processIssueWithSmartMode(context, github);
        }
      } catch (error) {
        console.error('Error processing comment command:', error);
        await github.addIssueComment(`Error processing command: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  });

  // Listen for issues being labeled
  app.on(['issues.labeled'], async (context) => {
    const github = new GitHubClient(context);
    
    // Check if the issue was labeled with our trigger label
    const label = context.payload.label;
    if (!label) return;
    
    const triggerLabels = [config.triggerLabel].concat(config.additionalTriggerLabels || []);
    if (!triggerLabels.includes(label.name)) {
      return;
    }
    
    console.log(`Processing issue with label: ${label.name}`);
    await processIssueWithSmartMode(context, github);
  });

  // Listen for new issues
  app.on('issues.opened', async (context) => {
    const github = new GitHubClient(context);
    
    try {
      const issueDetails = github.getIssueDetails();
      
      // Check if the issue already has our trigger label or any of our additional trigger labels
      const triggerLabels = [config.triggerLabel].concat(config.additionalTriggerLabels || []);
      const shouldProcess = triggerLabels.some(label => issueDetails.labels.includes(label));
      
      if (shouldProcess) {
        await processIssueWithSmartMode(context, github);
      }
    } catch (error) {
      console.error('Error processing newly opened issue:', error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      await github.addIssueComment(`${config.failureComment}\n\nError: ${errorMessage}`);
      await github.addReaction('confused');
    }
  });
  
  /**
   * Process an issue using smart mode selection
   */
  async function processIssueWithSmartMode(context: any, github: GitHubClient) {
    try {
      const issueDetails = github.getIssueDetails();
      
      // Add a comment to the issue indicating we're processing it
      await github.addIssueComment(config.processingComment);
      
      // Add a reaction to acknowledge
      await github.addReaction('eyes');
      
      // Get repository information
      const defaultBranch = await github.getDefaultBranch();
      const repoCloneUrl = await github.getRepositoryCloneUrl();
      const { owner, repo } = github.getRepoInfo();
      
      // Check if repository is private and get auth token if needed
      const isPrivate = await github.isPrivateRepository();
      let authToken: string | undefined;
      if (isPrivate) {
        console.log('Repository is private. Generating auth token for Git operations.');
        authToken = await github.getInstallationToken();
      }
      
      // Create a branch name for the fix
      let baseBranchName = `issue-${issueDetails.issue_number}`;
      
      // Initialize mode selector and multi-pass processor
      const modeSelector = new ModeSelector();
      await modeSelector.loadRepositoryConfig(); // Try to load custom config
      
      // Create multi-pass processor
      const processor = new MultiPassProcessor(modeSelector);
      
      // Process the issue with appropriate mode based on labels
      const result = await processor.process(
        repoCloneUrl,
        issueDetails.title,
        issueDetails.body,
        issueDetails.labels,
        baseBranchName,
        github,
        authToken
      );
      
      if (result.success) {
        console.log(`patchmycode successfully applied fixes using modes: ${result.modesUsed.join(', ')}. Creating pull request.`);
        
        // Create a detailed PR body with mode badges
        const modesBadges = result.modesUsed.length > 1 
          ? modeSelector.getMultiPassBadgeMarkdown(result.modesUsed.map(mode => 
              modeSelector.selectModeFromCommand(`/mode ${mode}`)!
            ))
          : modeSelector.getBadgeMarkdown(
              modeSelector.selectModeFromCommand(`/mode ${result.modesUsed[0]}`)!
            );
        
        const prBody = `
## AI-generated fix for issue #${issueDetails.issue_number}

This PR was automatically generated by patchmycode to address issue #${issueDetails.issue_number}.

${modesBadges}

### Issue Description
${issueDetails.title}

${issueDetails.body}

### Changes Made
${result.changes.map(file => `- \`${file}\``).join('\n')}

---
This PR was created automatically by patchmycode. Please review the changes carefully before merging.
        `.trim();
        
        // Create a pull request with the changes
        console.log(`Branch name used for PR: ${result.branchName || 'Using fallback construction'}`);
        const pullRequest = await github.createPullRequest({
          owner,
          repo,
          title: `${config.prTitlePrefix || 'Fix:'}${issueDetails.title}`,
          body: prBody,
          head: result.branchName || (result.modesUsed.length > 1 
            ? `${result.modesUsed[1]}-on-${result.modesUsed[0]}-${baseBranchName}` // Use the final branch name from multi-pass
            : `${result.modesUsed[0]}-${baseBranchName}`), // Use the mode-prefixed branch name
          base: defaultBranch,
          draft: config.prDraft || false,
          maintainer_can_modify: true
        });
        
        // Add labels to the pull request
        if (config.prLabels && config.prLabels.length > 0) {
          await github.addLabelsToPullRequest(pullRequest.data.number, config.prLabels);
        }
        
        // Add mode-specific labels
        await github.addLabelsToPullRequest(
          pullRequest.data.number, 
          result.modesUsed.map(mode => `mode:${mode}`)
        );
        
        // Add a comment to the issue with the pull request link
        const successComment = `${config.successComment}\n\n` +
          `✅ Fixed using modes: **${result.modesUsed.join('**, **')}**\n\n` +
          `Check out the PR: ${pullRequest.data.html_url}`;
        await github.addIssueComment(successComment);
        
        // Add a 'hooray' reaction to the issue to indicate success
        await github.addReaction('hooray');
      } else {
        console.log(`patchmycode failed to fix the issue: ${result.message}`);
        // Add a comment to the issue indicating the failure
        const failureComment = `${config.failureComment}\n\n${result.message}`;
        await github.addIssueComment(failureComment);
        
        // Add a 'confused' reaction to the issue to indicate failure
        await github.addReaction('confused');
      }
    } catch (error) {
      console.error('Error processing issue with patchmycode:', error);
      
      // Add a comment to the issue about the error
      const errorMessage = error instanceof Error ? error.message : String(error);
      await github.addIssueComment(`${config.failureComment}\n\nError: ${errorMessage}`);
      
      // Add a 'confused' reaction to the issue to indicate failure
      await github.addReaction('confused');
    }
  }
};
