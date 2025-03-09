// Configuration for the patchmycode bot

export interface PatchBotConfig {
  // Labels configuration
  triggerLabel: string;          // The label that triggers patchmycode to fix an issue
  additionalTriggerLabels?: string[]; // Additional labels that can trigger patches
  prLabels?: string[];           // Labels to add to created pull requests
  
  // Timeouts
  patchTimeout: number;          // Max time in milliseconds to wait for processing
  gitTimeout?: number;           // Max time for Git operations
  
  // Comments
  processingComment: string;     // Comment when starting to process an issue
  successComment: string;        // Comment when patchmycode successfully fixes an issue
  failureComment: string;        // Comment when patchmycode fails to fix an issue
  
  // LLM configuration
  model?: string;                // LLM model to use
  extraArgs?: string[];          // Additional arguments to pass to the LLM
  
  // Branch configuration
  branchPrefix?: string;         // Prefix for created branches
  
  // Pull request configuration
  prTitlePrefix?: string;        // Prefix for PR titles
  prDraft?: boolean;             // Whether to create PRs as drafts
  
  // Repository configuration
  includeFiles?: string[];       // Files to include in analysis (glob patterns)
  excludeFiles?: string[];       // Files to exclude from analysis (glob patterns)
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
const config: PatchBotConfig = {
  // Labels
  triggerLabel: getEnv('PATCH_TRIGGER_LABEL', 'fix:auto'),
  additionalTriggerLabels: getArrayEnv('PATCH_ADDITIONAL_TRIGGER_LABELS'),
  prLabels: getArrayEnv('PATCH_PR_LABELS', ['automated-fix']),
  
  // Timeouts
  patchTimeout: getNumberEnv('PATCH_TIMEOUT', 300000), // 5 minutes
  gitTimeout: getNumberEnv('GIT_TIMEOUT', 60000), // 1 minute
  
  // Comments
  processingComment: getEnv(
    'PATCH_PROCESSING_COMMENT', 
    '🤖 I\'m working on fixing this issue automatically...'
  ),
  successComment: getEnv(
    'PATCH_SUCCESS_COMMENT', 
    '✅ I\'ve created a pull request with a fix for this issue.'
  ),
  failureComment: getEnv(
    'PATCH_FAILURE_COMMENT', 
    '❌ I wasn\'t able to automatically fix this issue.'
  ),
  
  // LLM configuration
  model: getEnv('PATCH_MODEL', 'gpt-4o'),
  extraArgs: getArrayEnv('PATCH_EXTRA_ARGS'),
  
  // Branch configuration
  branchPrefix: getEnv('PATCH_BRANCH_PREFIX', 'patch-fix-'),
  
  // Pull request configuration
  prTitlePrefix: getEnv('PATCH_PR_TITLE_PREFIX', 'Fix: '),
  prDraft: getBoolEnv('PATCH_PR_DRAFT', false),
  
  // Repository configuration
  includeFiles: getArrayEnv('PATCH_INCLUDE_FILES'),
  excludeFiles: getArrayEnv('PATCH_EXCLUDE_FILES', ['node_modules/**', '.git/**']),
};

export default config;
