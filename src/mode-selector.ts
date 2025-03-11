import * as fs from 'fs';
import * as path from 'path';
import config from './config.js';

export type AiderMode = 'architect' | 'patcher' | 'hybrid:security' | 'hybrid:performance' | 'hybrid:typescript' | string;

export interface ModeSelectionResult {
  primaryMode: string;
  secondaryMode?: string; 
  needsMultiPass: boolean;
  systemPrompt?: string;
}

export interface ModeResult {
  primaryMode: string;
  secondaryMode?: string;
  needsMultiPass: boolean;
  systemPrompt?: string;
}

export class ModeSelector {
  private repositoryConfig: any = null;
  
  constructor() {}
  
  /**
   * Load custom configuration from repository if available
   */
  async loadRepositoryConfig(): Promise<boolean> {
    try {
      const configPath = path.join(process.cwd(), config.configPath);
      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf8');
        this.repositoryConfig = JSON.parse(configData);
        console.log('Loaded custom configuration from repository');
        return true;
      }
    } catch (error) {
      console.error('Error loading repository config:', error);
    }
    return false;
  }
  
  /**
   * Select mode based on issue labels
   */
  selectModeFromLabels(labels: string[]): ModeResult | null {
    if (!labels || labels.length === 0) {
      return null;
    }
    
    // Check each label against our configured mode labels
    for (const [mode, modeLabels] of Object.entries(config.modeLabels)) {
      const found = modeLabels.some(label => labels.includes(label));
      if (found) {
        // Parse hybrid modes
        if (mode.startsWith('hybrid:')) {
          return {
            primaryMode: mode,
            needsMultiPass: false,
            systemPrompt: this.getSystemPromptForMode(mode)
          };
        }
        
        // Check for multi-pass indicators
        const needsMultiPass = labels.some(label => 
          label === 'multipass' || 
          label === 'patchmycode:multipass'
        );
        
        if (needsMultiPass && mode === 'architect') {
          return {
            primaryMode: 'architect',
            secondaryMode: 'patcher',
            needsMultiPass: true,
            systemPrompt: this.getSystemPromptForMode('architect')
          };
        }
        
        return {
          primaryMode: mode,
          needsMultiPass: false,
          systemPrompt: this.getSystemPromptForMode(mode)
        };
      }
    }
    
    // Check for explicit multipass label
    const hasMultipassLabel = labels.some(label => 
      label === 'multipass' || 
      label === 'patchmycode:multipass'
    );
    
    if (hasMultipassLabel) {
      return {
        primaryMode: config.defaultMultiPassSequence[0],
        secondaryMode: config.defaultMultiPassSequence[1],
        needsMultiPass: true,
        systemPrompt: this.getSystemPromptForMode(config.defaultMultiPassSequence[0])
      };
    }
    
    return null;
  }
  
  /**
   * Select mode based on command
   */
  selectModeFromCommand(command: string): ModeResult | null {
    // Extract mode from command (e.g., "/mode architect")
    const parts = command.trim().split(/\s+/);
    if (parts.length < 2) {
      return null;
    }
    
    const modeArg = parts[1].toLowerCase();
    
    // Handle multipass command
    if (modeArg === 'multipass') {
      return {
        primaryMode: config.defaultMultiPassSequence[0],
        secondaryMode: config.defaultMultiPassSequence[1],
        needsMultiPass: true,
        systemPrompt: this.getSystemPromptForMode(config.defaultMultiPassSequence[0])
      };
    }
    
    // Handle custom multipass sequence
    if (modeArg.includes('+')) {
      const modes = modeArg.split('+');
      if (modes.length >= 2) {
        return {
          primaryMode: modes[0],
          secondaryMode: modes[1],
          needsMultiPass: true,
          systemPrompt: this.getSystemPromptForMode(modes[0])
        };
      }
    }
    
    // Handle standard modes
    if (modeArg === 'architect' || modeArg === 'patcher') {
      return {
        primaryMode: modeArg,
        needsMultiPass: false,
        systemPrompt: this.getSystemPromptForMode(modeArg)
      };
    }
    
    // Handle hybrid modes
    if (modeArg.startsWith('hybrid:')) {
      return {
        primaryMode: modeArg,
        needsMultiPass: false,
        systemPrompt: this.getSystemPromptForMode(modeArg)
      };
    }
    
    return null;
  }
  
  /**
   * Analyze an issue to determine the best mode based on content
   */
  analyzeIssueForMode(issueDetails: any): ModeResult {
    const title = issueDetails.title || '';
    const body = issueDetails.body || '';
    const labels = issueDetails.labels || [];
    
    // First check if we should use a mode based on labels
    const labelResult = this.selectModeFromLabels(labels);
    if (labelResult) {
      return labelResult;
    }
    
    // Check for keywords in title and body that suggest architectural changes
    const architectureKeywords = [
      'refactor', 'redesign', 'architecture', 'restructure',
      'design pattern', 'rewrite', 'overhaul', 'major update',
      'significant change', 'fundamental', 'framework', 'infrastructure'
    ];
    
    const patcherKeywords = [
      'fix bug', 'bugfix', 'patch', 'issue', 'error',
      'crash', 'typo', 'incorrect behavior', 'minor issue',
      'quick fix', 'small change', 'small update'
    ];
    
    // Count occurrences of keywords
    let architectCount = 0;
    let patcherCount = 0;
    
    // Check title
    architectureKeywords.forEach(keyword => {
      if (title.toLowerCase().includes(keyword.toLowerCase())) {
        architectCount++;
      }
    });
    
    patcherKeywords.forEach(keyword => {
      if (title.toLowerCase().includes(keyword.toLowerCase())) {
        patcherCount++;
      }
    });
    
    // Check body
    architectureKeywords.forEach(keyword => {
      if (body.toLowerCase().includes(keyword.toLowerCase())) {
        architectCount++;
      }
    });
    
    patcherKeywords.forEach(keyword => {
      if (body.toLowerCase().includes(keyword.toLowerCase())) {
        patcherCount++;
      }
    });
    
    // Check for code blocks as they might indicate patches
    const codeBlockCount = (body.match(/```/g) || []).length / 2;
    if (codeBlockCount > 0) {
      patcherCount += codeBlockCount;
    }
    
    // Adjust weights
    architectCount *= 2; // Architecture keywords have higher weight
    
    // Determine mode based on counts
    if (architectCount > patcherCount) {
      if (architectCount > 3) {
        // Major architectural changes likely needed
        return {
          primaryMode: 'architect',
          secondaryMode: 'patcher',
          needsMultiPass: true,
          systemPrompt: this.getSystemPromptForMode('architect')
        };
      } else {
        // Moderate architectural changes, single pass is fine
        return {
          primaryMode: 'architect',
          needsMultiPass: false,
          systemPrompt: this.getSystemPromptForMode('architect')
        };
      }
    } else {
      // Default to patcher
      return {
        primaryMode: 'patcher',
        needsMultiPass: false,
        systemPrompt: this.getSystemPromptForMode('patcher')
      };
    }
  }
  
  /**
   * Get the system prompt for a specific mode
   */
  getSystemPromptForMode(mode: string): string | undefined {
    // Check repository config first
    if (this.repositoryConfig && this.repositoryConfig.systemPrompts && this.repositoryConfig.systemPrompts[mode]) {
      return this.repositoryConfig.systemPrompts[mode];
    }
    
    // Default system prompts
    switch (mode) {
      case 'architect':
        return "You are an expert software architect. Focus on making structural improvements, refactoring, and ensuring the codebase follows best practices and design patterns. Consider the big picture and long-term maintainability.";
      
      case 'patcher':
        return "You are an expert programmer focused on fixing bugs and implementing specific features. Pay attention to detail and make targeted changes to solve the immediate problem without unnecessary refactoring.";
      
      case 'hybrid:security':
        return "You are a security expert. Identify and fix security vulnerabilities, ensure proper input validation, prevent injection attacks, and follow security best practices.";
      
      case 'hybrid:performance':
        return "You are a performance optimization expert. Identify bottlenecks, improve algorithm efficiency, reduce unnecessary operations, and optimize resource usage.";
      
      case 'hybrid:typescript':
        return "You are a TypeScript expert. Add proper type annotations, convert JavaScript to TypeScript, improve type safety, and leverage TypeScript features effectively.";
      
      default:
        return undefined;
    }
  }
  
  /**
   * Get the badge markdown for a specific mode
   */
  getBadgeMarkdown(modeResult: ModeResult): string {
    const mode = modeResult.primaryMode;
    const badgeColor = this.getBadgeColorForMode(mode);
    const badgeText = this.getBadgeTextForMode(mode);
    
    return `![${mode}](https://img.shields.io/badge/${badgeText}-${badgeColor})`;
  }
  
  /**
   * Get badge markdown for multiple modes
   */
  getMultiPassBadgeMarkdown(modes: ModeResult[]): string {
    return modes.map(mode => this.getBadgeMarkdown(mode)).join(' ');
  }
  
  /**
   * Get badge color for a specific mode
   */
  private getBadgeColorForMode(mode: string): string {
    switch (mode) {
      case 'architect':
        return 'blue';
      case 'patcher':
        return 'green';
      case 'hybrid:security':
        return 'red';
      case 'hybrid:performance':
        return 'orange';
      case 'hybrid:typescript':
        return 'blueviolet';
      default:
        return 'lightgrey';
    }
  }
  
  /**
   * Get badge text for a specific mode
   */
  private getBadgeTextForMode(mode: string): string {
    switch (mode) {
      case 'architect':
        return 'Architect-8A2BE2';
      case 'patcher':
        return 'Patcher-2E8B57';
      case 'hybrid:security':
        return 'Security-FF0000';
      case 'hybrid:performance':
        return 'Performance-FFA500';
      case 'hybrid:typescript':
        return 'TypeScript-3178C6';
      default:
        const formatted = mode.replace(':', '%3A');
        return `${formatted}-lightgrey`;
    }
  }
  
  /**
   * Get model to use for a specific mode
   */
  getModelForMode(mode: string): string | undefined {
    // Check repository config first
    if (this.repositoryConfig && this.repositoryConfig.modelMap && this.repositoryConfig.modelMap[mode]) {
      return this.repositoryConfig.modelMap[mode];
    }
    
    return undefined;
  }
} 