# System Patterns: patchmycode

## System Architecture

patchmycode is built using a modular architecture with clear separation of concerns:

```mermaid
flowchart TD
    Webhook[GitHub Webhook] --> Probot[Probot Framework]
    Probot --> EventHandlers[Event Handlers]
    EventHandlers --> GitHubClient[GitHub Client]
    EventHandlers --> PatchClient[Patch Client]
    GitHubClient --> GitHubAPI[GitHub API]
    PatchClient --> AIEngine[AI Code Assistant]
    AIEngine --> LocalGit[Local Git Operations]
    LocalGit --> GitHubAPI
    Config[TypeScript Config] --> EventHandlers
    Config --> GitHubClient
    Config --> PatchClient
    ModeSelector[Mode Selector] --> PatchClient
    ModeSelector --> MultiPassProcessor[Multi-Pass Processor]
```

### Components

1. **Probot Framework**
   - Handles webhook registration and event routing
   - Manages authentication with GitHub API
   - Provides logging and error handling

2. **Event Handlers**
   - Process GitHub events (issues, labels)
   - Orchestrate the workflow between GitHub and AI
   - Maintain state during the fix process

3. **GitHub Client**
   - Abstracts GitHub API interactions
   - Handles repository operations (clone, branch, PR)
   - Manages issue comments and labels

4. **Patch Client**
   - Integrates with the AI code assistant
   - Manages temporary working directories
   - Captures and processes AI-generated output

5. **Configuration Module**
   - Typed configuration interface (PatchBotConfig)
   - Environment variable mapping with defaults
   - Helper functions for different value types

6. **Mode Selector**
   - Analyzes issues to determine processing mode
   - Selects appropriate system prompts
   - Supports different processing strategies

7. **Multi-Pass Processor**
   - Manages complex processing sequences
   - Coordinates between different modes
   - Handles sequential code refinement

## Key Technical Decisions

1. **TypeScript for Type Safety**
   - Using TypeScript to ensure type safety and improve maintainability
   - Interfaces defined for all major data structures
   - Type checking for GitHub API responses
   - Type-safe configuration system

2. **Modular Design**
   - Clear separation between GitHub integration and Aider integration
   - Configuration isolated in a separate module
   - Each component has a single responsibility

3. **Promise-based Async Processing**
   - Asynchronous handling of GitHub events
   - Proper error propagation through promise chains
   - Cleanup of resources even during failures

4. **Temporary File Management**
   - Secure creation of temporary directories
   - Proper cleanup after operations
   - Isolation between concurrent operations

5. **Environment-based Configuration**
   - Configuration via environment variables with defaults
   - Type-safe access to configuration values
   - Helper functions for parsing different value types

## Design Patterns in Use

1. **Dependency Injection**
   - Passing context objects to clients
   - Makes testing easier through mocking
   - Allows for configuration changes without code changes

2. **Factory Methods**
   - Creation of clients through factory methods
   - Consistent initialization of components
   - Centralized error handling during initialization

3. **Command Pattern**
   - Encapsulating Aider operations as commands
   - Standardized execution and result handling
   - Separation of command execution from result processing

4. **Adapter Pattern**
   - Adapting Aider CLI to programmatic interface
   - Standardizing error formats between systems
   - Translating between GitHub API and local operations

5. **Strategy Pattern**
   - Different processing modes as strategies
   - Mode selection based on issue content
   - Dynamic behavior based on selected strategy

6. **Configuration Interface Pattern**
   - TypeScript interface for configuration
   - Environment variable mapping
   - Type-safe access to configuration values

## Component Relationships

1. **Event Handler → GitHub Client**
   - Event handlers use GitHub client to interact with GitHub API
   - GitHub client provides repository information to event handlers
   - Event handlers process GitHub client results

2. **Event Handler → Patch Client**
   - Event handlers pass issue information to Patch client
   - Patch client returns fix results to event handlers
   - Event handlers use Patch client for temporary directory management

3. **Patch Client → Local Git**
   - Patch client uses local Git operations
   - Git operations are encapsulated within Patch client
   - Results of Git operations inform Patch client responses

4. **GitHub Client → GitHub API**
   - GitHub client translates app operations to API calls
   - API responses are processed and standardized
   - Error handling and rate limiting managed by GitHub client

5. **Mode Selector → Patch Client**
   - Mode selector determines processing strategy
   - Patch client behavior varies by selected mode
   - System prompts customized for each mode

6. **Configuration → All Components**
   - Typed configuration accessed by all components
   - Environment variables influence component behavior
   - Default values ensure consistent operation
