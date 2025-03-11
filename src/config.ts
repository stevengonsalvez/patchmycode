// Configuration for the patchmycode bot

export interface PatchBotConfig {
  // Labels configuration
  triggerLabel: string;          // The label that triggers patchmycode to fix an issue
  additionalTriggerLabels?: string[]; // Additional labels that can trigger patches
  prLabels?: string[];           // Labels to add to created pull requests
  
  // Timeouts
  patchTimeout: number;          // Max time in seconds to wait for processing
  gitTimeout?: number;           // Max time for Git operations
  
  // Comments
  processingComment: string;     // Comment when starting to process an issue
  successComment: string;        // Comment when patchmycode successfully fixes an issue
  failureComment: string;        // Comment when patchmycode fails to fix an issue
  
  // LLM configuration
  model?: string;                // Default LLM model to use
  extraArgs?: string[];          // Default additional arguments to pass to the LLM
  
  // Mode-specific LLM configuration
  modeModels?: Record<string, string>; // Mapping of modes to specific models
  modeExtraArgs?: Record<string, string[]>; // Mapping of modes to specific extra args
  
  // API Keys configuration
  openaiKeys?: string[];         // OpenAI API keys for load balancing
  anthropicKeys?: string[];      // Anthropic API keys for load balancing
  openrouterKey?: string;        // OpenRouter API key
  
  // Branch configuration
  branchPrefix?: string;         // Prefix for created branches
  
  // Pull request configuration
  prTitlePrefix?: string;        // Prefix for PR titles
  prDraft?: boolean;             // Whether to create PRs as drafts
  
  // Repository configuration
  includeFiles?: string[];       // Files to include in analysis (glob patterns)
  excludeFiles?: string[];       // Files to exclude from analysis (glob patterns)
  
  // Mode configuration
  defaultMode: string;           // Default processing mode
  modeLabels: Record<string, string[]>; // Mapping of modes to labels
  
  // Multi-pass configuration
  enableMultiPass: boolean;      // Whether to enable multi-pass processing
  defaultMultiPassSequence: string[]; // Default sequence for multi-pass processing
  
  // Repository specific configuration path
  configPath: string;            // Path to repository-specific configuration file
}

// Helper to get string environment variable
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

// Create a map for mode-specific models
const getModeModels = (): Record<string, string> => {
  const modeModels: Record<string, string> = {};
  
  // Check for architect mode model
  const architectModel = process.env.PATCH_MODEL_ARCHITECT;
  if (architectModel) {
    modeModels['architect'] = architectModel;
  }
  
  // Check for patcher mode model
  const patcherModel = process.env.PATCH_MODEL_PATCHER;
  if (patcherModel) {
    modeModels['patcher'] = patcherModel;
  }
  
  // Check for hybrid mode models
  const securityModel = process.env.PATCH_MODEL_HYBRID_SECURITY;
  if (securityModel) {
    modeModels['hybrid:security'] = securityModel;
  }
  
  const performanceModel = process.env.PATCH_MODEL_HYBRID_PERFORMANCE;
  if (performanceModel) {
    modeModels['hybrid:performance'] = performanceModel;
  }
  
  const typescriptModel = process.env.PATCH_MODEL_HYBRID_TYPESCRIPT;
  if (typescriptModel) {
    modeModels['hybrid:typescript'] = typescriptModel;
  }
  
  return modeModels;
};

// Create a map for mode-specific extra args
const getModeExtraArgs = (): Record<string, string[]> => {
  const modeExtraArgs: Record<string, string[]> = {};
  
  // Check for architect mode extra args
  const architectArgs = process.env.PATCH_EXTRA_ARGS_ARCHITECT;
  if (architectArgs) {
    modeExtraArgs['architect'] = architectArgs.split(',').map(item => item.trim()).filter(Boolean);
  }
  
  // Check for patcher mode extra args
  const patcherArgs = process.env.PATCH_EXTRA_ARGS_PATCHER;
  if (patcherArgs) {
    modeExtraArgs['patcher'] = patcherArgs.split(',').map(item => item.trim()).filter(Boolean);
  }
  
  // Check for hybrid mode extra args
  const securityArgs = process.env.PATCH_EXTRA_ARGS_HYBRID_SECURITY;
  if (securityArgs) {
    modeExtraArgs['hybrid:security'] = securityArgs.split(',').map(item => item.trim()).filter(Boolean);
  }
  
  const performanceArgs = process.env.PATCH_EXTRA_ARGS_HYBRID_PERFORMANCE;
  if (performanceArgs) {
    modeExtraArgs['hybrid:performance'] = performanceArgs.split(',').map(item => item.trim()).filter(Boolean);
  }
  
  const typescriptArgs = process.env.PATCH_EXTRA_ARGS_HYBRID_TYPESCRIPT;
  if (typescriptArgs) {
    modeExtraArgs['hybrid:typescript'] = typescriptArgs.split(',').map(item => item.trim()).filter(Boolean);
  }
  
  return modeExtraArgs;
};

// Get multiple API keys
const getApiKeys = (): {
  openaiKeys: string[];
  anthropicKeys: string[];
  openrouterKey?: string;
} => {
  // For OpenAI, first check for multiple keys, then fall back to single key
  let openaiKeys: string[] = [];
  const multipleOpenAiKeys = process.env.OPENAI_API_KEYS;
  if (multipleOpenAiKeys) {
    openaiKeys = multipleOpenAiKeys.split(',').map(key => key.trim()).filter(Boolean);
  } else if (process.env.OPENAI_API_KEY) {
    openaiKeys = [process.env.OPENAI_API_KEY];
  }
  
  // For Anthropic, first check for multiple keys, then fall back to single key
  let anthropicKeys: string[] = [];
  const multipleAnthropicKeys = process.env.ANTHROPIC_API_KEYS;
  if (multipleAnthropicKeys) {
    anthropicKeys = multipleAnthropicKeys.split(',').map(key => key.trim()).filter(Boolean);
  } else if (process.env.ANTHROPIC_API_KEY) {
    anthropicKeys = [process.env.ANTHROPIC_API_KEY];
  }
  
  // For OpenRouter, just check for a single key
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  
  return {
    openaiKeys,
    anthropicKeys,
    openrouterKey: openrouterKey ? openrouterKey : undefined
  };
};

// Default configuration with environment variable overrides
const config: PatchBotConfig = {
  // Labels
  triggerLabel: getEnv('PATCH_TRIGGER_LABEL', 'patchmycode:fix'),
  additionalTriggerLabels: getArrayEnv('PATCH_ADDITIONAL_TRIGGER_LABELS', ['patchmycode:architect', 'patchmycode:patcher']),
  prLabels: getArrayEnv('PATCH_PR_LABELS', ['patchmycode-fix']),
  
  // Timeouts
  patchTimeout: getNumberEnv('PATCH_TIMEOUT', 600), // 10 minutes in seconds
  gitTimeout: getNumberEnv('GIT_TIMEOUT', 60), // 1 minute in seconds
  
  // Comments
  processingComment: getEnv(
    'PATCH_PROCESSING_COMMENT', 
    '🔍 I\'m analyzing this issue and will try to fix it...'
  ),
  successComment: getEnv(
    'PATCH_SUCCESS_COMMENT', 
    '✅ I\'ve created a pull request with a proposed fix for this issue.'
  ),
  failureComment: getEnv(
    'PATCH_FAILURE_COMMENT', 
    '❌ I wasn\'t able to automatically fix this issue.'
  ),
  
  // LLM configuration
  model: getEnv('PATCH_MODEL', 'gpt-4-turbo'),
  extraArgs: getArrayEnv('PATCH_EXTRA_ARGS'),
  
  // Mode-specific LLM configuration
  modeModels: getModeModels(),
  modeExtraArgs: getModeExtraArgs(),
  
  // API Keys configuration
  ...getApiKeys(),
  
  // Branch configuration
  branchPrefix: getEnv('PATCH_BRANCH_PREFIX', 'patchmycode-'),
  
  // PR configuration
  prTitlePrefix: getEnv('PATCH_PR_TITLE_PREFIX', 'Fix: '),
  prDraft: getBoolEnv('PATCH_PR_DRAFT', false),
  
  // Repository configuration
  includeFiles: getArrayEnv('PATCH_INCLUDE_FILES'),
  excludeFiles: getArrayEnv('PATCH_EXCLUDE_FILES'),
  
  // Mode configuration
  defaultMode: getEnv('PATCH_DEFAULT_MODE', 'patcher'),
  modeLabels: {
    'architect': getArrayEnv('PATCH_ARCHITECT_LABELS', ['patchmycode:architect', 'major-change', 'refactor']),
    'patcher': getArrayEnv('PATCH_PATCHER_LABELS', ['patchmycode:patcher', 'bugfix', 'minor-fix']),
    'hybrid:security': getArrayEnv('PATCH_SECURITY_LABELS', ['security', 'vulnerability']),
    'hybrid:performance': getArrayEnv('PATCH_PERFORMANCE_LABELS', ['performance', 'optimization']),
    'hybrid:typescript': getArrayEnv('PATCH_TYPESCRIPT_LABELS', ['typescript-migration', 'type-safety'])
  },
  
  // Multi-pass configuration
  enableMultiPass: getBoolEnv('PATCH_ENABLE_MULTIPASS', true),
  defaultMultiPassSequence: getArrayEnv('PATCH_MULTIPASS_SEQUENCE', ['architect', 'patcher']),
  
  // Repository configuration path
  configPath: getEnv('PATCH_CONFIG_PATH', '.patchmycode/config.json')
};

export default config;
