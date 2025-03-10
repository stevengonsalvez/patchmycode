# Active Context: patchmycode

## Current Work Focus

We have implemented a Probot GitHub app named "patchmycode" that uses AI to automatically fix GitHub issues based on labels. The app has been significantly enhanced from its initial bootstrapped state and now includes robust integrations with both GitHub and AI-powered code generation (using Aider.chat as the underlying mechanism).

### Primary Goals

1. **Testing and Quality Assurance**
   - Implement comprehensive tests for all components
   - Create integration tests for the full workflow
   - Develop mocks for external services

2. **Repository-Level Configuration**
   - Support configuration via repository files
   - Allow per-repository customization
   - Implement configuration validation

3. **Advanced Aider Features**
   - Support for repository-specific contexts
   - Optional interactive mode for complex issues
   - Better capture and presentation of Aider reasoning

4. **Deployment and Documentation**
   - Finalize deployment documentation
   - Document best practices for usage
   - Create examples of typical workflows

## Recent Changes

The project has been substantially enhanced with:
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

1. **Implement Testing**
   - Develop unit tests for the GitHub client
   - Create unit tests for the Aider client
   - Implement integration tests for the full workflow
   - Set up CI/CD for automated testing

2. **Repository-Level Configuration**
   - Implement reading configuration from repository files (.github/patchmycode.yml)
   - Support merging repository config with global config
   - Add validation for configuration values
   - Document repository configuration options

3. **Advanced Aider Features**
   - Explore support for repository-specific context beyond issues
   - Research options for interactive mode for complex issues
   - Improve presentation of Aider reasoning in PR descriptions
   - Add support for Aider's --map option to limit file scope

4. **Documentation and Examples**
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

2. **Authentication Handling**
   - Using GitHub App installation tokens for API access
   - Generating temporary tokens for Git operations
   - Securely managing tokens throughout operations
   - Supporting private repositories with proper authentication

3. **Error Handling Strategy**
   - Comprehensive error catching and processing at the component level
   - Detailed error messages in logs and user-friendly messages in comments
   - Resource cleanup in finally blocks to ensure proper cleanup even during errors
   - Using reactions to provide visual feedback on issues

### Current Considerations

1. **Repository Configuration**
   - Where to store repository-specific configuration? (.github/patchmycode.yml is the leading option)
   - How to merge repository configuration with global configuration
   - What overrides should be allowed at the repository level

2. **Testing Strategy**
   - How to effectively mock GitHub API for testing
   - How to mock Aider to test without needing LLM access
   - How to set up CI/CD for automated testing

3. **Deployment Options**
   - Best practices for running in production
   - Securing API keys in different environments
   - Scaling considerations for high-volume repositories

4. **Advanced Use Cases**
   - Supporting more complex issue workflows
   - Integration with project boards or milestones
   - Supporting different types of issues beyond simple bug fixes
