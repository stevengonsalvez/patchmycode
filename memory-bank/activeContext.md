# Active Context: patchmycode

## Current Work Focus

We have implemented a Probot GitHub app named "patchmycode" that uses AI to automatically fix GitHub issues based on labels. The app has been significantly enhanced from its initial bootstrapped state and now includes robust integrations with both GitHub and AI-powered code generation (using Aider.chat as the underlying mechanism).

Recent improvements include migrating from JavaScript to TypeScript for configuration management, implementing a type-safe configuration system, and supporting smart mode selection for different types of issues.

### Primary Goals

1. **Configuration System Improvements**
   - ✅ Migrate from JavaScript to TypeScript for configuration
   - ✅ Implement type-safe configuration interfaces
   - ✅ Support environment variable overrides with defaults
   - ✅ Add mode-specific configuration options
   - Support configuration via repository files
   - Implement configuration validation

2. **Smart Mode Selection**
   - ✅ Implement mode selection based on issue labels
   - ✅ Support different processing modes (architect, patcher)
   - ✅ Add support for hybrid specialized modes
   - ✅ Support multi-pass processing for complex issues
   - Improve mode selection based on issue content analysis
   - Add visual indicators for processing modes in PRs

3. **Testing and Quality Assurance**
   - Implement comprehensive tests for all components
   - Create integration tests for the full workflow
   - Develop mocks for external services

4. **Deployment and Documentation**
   - Update documentation to reflect configuration changes
   - Finalize deployment documentation
   - Document best practices for usage
   - Create examples of typical workflows

## Recent Changes

The project has been substantially enhanced with:
- ✅ Migrated configuration from JavaScript to TypeScript
- ✅ Added typed configuration interfaces for better type safety
- ✅ Implemented environment variable helpers for different value types
- ✅ Added smart mode selection system for different issue types
- ✅ Added hybrid mode support for specialized tasks
- ✅ Implemented multi-pass processing for complex issues
- Complete rebranding from "Probot Aider Bot" to "patchmycode"
- Refactored codebase for consistent naming and branding
- Updated documentation to reflect the new project identity
- Memory bank structure for documentation
- Enhanced AI client with installation management
- Improved GitHub client with rate limiting and authentication
- Expanded configuration options via environment variables
- Detailed error handling and reporting
- Support for private repositories
- Support for multiple trigger labels
- Improved pull request creation with detailed descriptions

## Next Steps

1. **Complete Configuration System**
   - Implement reading configuration from repository files (.github/patchmycode.yml)
   - Support merging repository config with global config
   - Add validation for configuration values
   - Document repository configuration options

2. **Enhance Mode Selection**
   - Improve mode analysis based on issue content
   - Add more specialized modes for common tasks
   - Enhance visual indicators for modes in PRs

3. **Implement Testing**
   - Develop unit tests for the GitHub client
   - Create unit tests for the Aider client
   - Implement integration tests for the full workflow
   - Set up CI/CD for automated testing

4. **Documentation and Examples**
   - Update documentation to reflect configuration changes
   - Create example workflows for common use cases
   - Document best practices for writing issue descriptions
   - Add more troubleshooting guidance
   - Create deployment guides for different platforms

## Active Decisions and Considerations

### Architecture Decisions

1. **Modular Design**
   - Keeping GitHub and Aider integration separate has been successful
   - Using clear interfaces between components allows for easier testing
   - Configuration module serves as a central place for all settings
   - TypeScript interfaces provide type safety for configuration

2. **Configuration Management**
   - Using TypeScript interfaces for type-safe configuration
   - Environment variable helpers for different value types
   - Centralized configuration with sensible defaults
   - Mode-specific configuration options

3. **Mode Selection Strategy**
   - Using a separate ModeSelector class for mode selection logic
   - Supporting different processing modes for different issue types
   - Multi-pass processing for complex issues
   - Hybrid modes for specialized tasks

4. **Authentication Handling**
   - Using GitHub App installation tokens for API access
   - Generating temporary tokens for Git operations
   - Securely managing tokens throughout operations
   - Supporting private repositories with proper authentication

5. **Error Handling Strategy**
   - Comprehensive error catching and processing at the component level
   - Detailed error messages in logs and user-friendly messages in comments
   - Resource cleanup in finally blocks to ensure proper cleanup even during errors
   - Using reactions to provide visual feedback on issues

### Current Considerations

1. **Repository Configuration**
   - Where to store repository-specific configuration? (.github/patchmycode.yml is the leading option)
   - How to merge repository configuration with global configuration
   - What overrides should be allowed at the repository level
   - How to validate repository configuration against the TypeScript interface

2. **Mode Selection Improvements**
   - How to better analyze issue content for mode selection
   - What additional specialized modes might be useful
   - How to handle mode selection edge cases
   - Proper visual indicators for different modes

3. **Testing Strategy**
   - How to effectively mock GitHub API for testing
   - How to mock Aider to test without needing LLM access
   - How to set up CI/CD for automated testing

4. **Deployment Options**
   - Best practices for running in production
   - Securing API keys in different environments
   - Scaling considerations for high-volume repositories
