// Configuration for the Aider bot

export interface AiderBotConfig {
  // Labels configuration
  triggerLabel: string;          // The label that triggers Aider to fix an issue
  additionalTriggerLabels?: string[]; // Additional labels that can trigger Aider
  prLabels?: string[];           // Labels to add to created pull requests
  
  // Timeouts
  aiderTimeout: number;          // Max time in milliseconds to wait for Aider to process
  gitTimeout?: number;           // Max time for Git operations
  
  // Comments
  processingComment: string;     // Comment when starting to process an issue
  successComment: string;        // Comment when Aider successfully fixes an issue
  failureComment: string;        // Comment when Aider fails to fix an issue
  
  // Aider configuration
  aiderModel?: string;           // LLM model to use with Aider
  aiderExtraArgs?: string[];     // Additional arguments to pass to Aider
  
  // Branch configuration
  branchPrefix?: string;         // Prefix for created branches
  
  // Pull request configuration
  prTitlePrefix?: string;        // Prefix for PR titles
  prDraft?: boolean;             // Whether to create PRs as drafts
  
  // Repository configuration
  includeFiles?: string[];       // Files to include in Aider analysis (glob patterns)
  excludeFiles?: string[];       // Files to exclude from Aider analysis (glob patterns)
}

// Helper to get environment variable with a default value
const getEnv = (key: string, defaultValue: string): string => 
  process.env[key] || defaultValue;

// Helper to get boolean environment variable
const getBoolEnv = (key: string, defaultValue: boolean): boolean => {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
};

// Helper to get array environment variable (comma-separated string)
const getArrayEnv = (key: string, defaultValue: string[] = []): string[] => {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.split(',').map(item => item.trim()).filter(Boolean);
};

// Helper to get number environment variable
const getNumberEnv = (key: string, defaultValue: number): number => {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

// Default configuration with environment variable overrides
const config: AiderBotConfig = {
  // Labels
  triggerLabel: getEnv('AIDER_TRIGGER_LABEL', 'aider:fix'),
  additionalTriggerLabels: getArrayEnv('AIDER_ADDITIONAL_TRIGGER_LABELS'),
  prLabels: getArrayEnv('AIDER_PR_LABELS', ['automated-fix']),
  
  // Timeouts
  aiderTimeout: getNumberEnv('AIDER_TIMEOUT', 300000), // 5 minutes
  gitTimeout: getNumberEnv('GIT_TIMEOUT', 60000), // 1 minute
  
  // Comments
  processingComment: getEnv(
    'AIDER_PROCESSING_COMMENT', 
    '🤖 I\'m working on fixing this issue using Aider...'
  ),
  successComment: getEnv(
    'AIDER_SUCCESS_COMMENT', 
    '✅ I\'ve created a pull request with a fix for this issue.'
  ),
  failureComment: getEnv(
    'AIDER_FAILURE_COMMENT', 
    '❌ I wasn\'t able to automatically fix this issue with Aider.'
  ),
  
  // Aider configuration
  aiderModel: getEnv('AIDER_MODEL', 'gpt-4o'),
  aiderExtraArgs: getArrayEnv('AIDER_EXTRA_ARGS'),
  
  // Branch configuration
  branchPrefix: getEnv('AIDER_BRANCH_PREFIX', 'aider-fix-'),
  
  // Pull request configuration
  prTitlePrefix: getEnv('AIDER_PR_TITLE_PREFIX', 'Fix: '),
  prDraft: getBoolEnv('AIDER_PR_DRAFT', false),
  
  // Repository configuration
  includeFiles: getArrayEnv('AIDER_INCLUDE_FILES'),
  excludeFiles: getArrayEnv('AIDER_EXCLUDE_FILES', ['node_modules/**', '.git/**']),
};

export default config;
