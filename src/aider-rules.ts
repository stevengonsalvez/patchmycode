// Helper functions for appending rules to Aider messages
import config from './config.js';

/**
 * Appends development rules to an Aider message
 * @param message The base message to append rules to
 * @returns The message with rules appended
 */
export function appendRulesToMessage(message: string): string {
  // If no rules, return original message
  if (!config.aiderRules || config.aiderRules.length === 0) {
    return message;
  }
  
  // Add rules section
  let result = message;
  result += '\n\n## Development Rules\n';
  
  // Add each rule as a bullet point
  config.aiderRules.forEach(rule => {
    result += `\n- ${rule}`;
  });
  
  return result;
}

/**
 * Gets the full message for Aider with rules 
 * @param issueTitle The title of the issue
 * @param issueBody The body of the issue
 * @returns A formatted message with rules appended
 */
export function getAiderMessage(issueTitle: string, issueBody: string): string {
  const baseMessage = `# ${issueTitle}\n\n${issueBody}`;
  return appendRulesToMessage(baseMessage);
}