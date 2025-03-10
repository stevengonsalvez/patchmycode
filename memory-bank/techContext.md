# Technical Context: patchmycode

## Technologies Used

### Core Framework and Languages
- **Node.js**: JavaScript runtime environment (v18+)
- **TypeScript**: Typed superset of JavaScript for better code maintainability
- **Probot**: GitHub App framework that simplifies GitHub webhook handling

### GitHub Integration
- **Octokit**: GitHub REST API client library
- **@octokit/plugin-rest-endpoint-methods**: Strongly typed GitHub API endpoints
- **Probot Context**: Contextual information for GitHub events

### External Tools
- **Aider**: AI-powered coding assistant used as the backend (https://aider.chat)
- **Git**: Distributed version control system for code repository operations

### Process Management
- **execa**: Better child process execution for Node.js
- **fs/promises**: Promise-based filesystem operations
- **os**: Operating system utilities for temporary path management

### Testing and Development
- **Vitest**: Testing framework for modern JavaScript
- **nock**: HTTP request mocking and expectations library
- **smee-client**: Webhook proxy client for local development

### Deployment
- **Docker**: Containerization for consistent deployment
- **GitHub Actions**: CI/CD integration (potentially used for deployment)

## Development Setup

### Local Development Requirements
1. **Node.js v18+**: Required runtime environment
2. **npm**: Package manager for JavaScript
3. **Git**: Required for repository operations
4. **Aider**: Must be installed and configured locally
5. **smee.io**: Webhook forwarding service for local development

### Environment Variables
- `APP_ID`: GitHub App ID from GitHub App registration
- `PRIVATE_KEY`: Private key from GitHub App registration
- `WEBHOOK_SECRET`: Secret for webhook verification
- `WEBHOOK_PROXY_URL`: URL for local development webhook forwarding
- `LOG_LEVEL`: Logging level (debug, info, warn, error)

### Setup Steps
1. Clone the repository
2. Run `npm install` to install dependencies
3. Create a `.env` file with required environment variables
4. Register a GitHub App via GitHub Developer Settings
5. Start the Smee.io proxy for webhook forwarding
6. Run `npm start` to start the bot locally

## Technical Constraints

### GitHub API Limitations
- Rate limiting may affect performance during heavy usage
- Webhook payload size limits may affect very large issues
- API response times may affect long-running operations

### AI Limitations
- Requires proper installation and configuration of underlying tools
- May have version dependencies
- Processing time varies based on issue complexity
- Dependent on LLM API availability and reliability

### Security Considerations
- GitHub credentials must be securely managed
- Temporary directories must be properly isolated
- Access to repositories must be properly scoped
- Issue content must be sanitized before processing

## Dependencies

### Required External Services
- GitHub API
- Aider CLI tool
- Git CLI tool
- LLM API (used by Aider)

### Runtime Dependencies
```
"@actions/exec": "^1.1.1",
"@actions/io": "^1.1.3",
"@octokit/rest": "^21.1.1",
"execa": "^9.5.2",
"probot": "^13.0.1"
```

### Development Dependencies
```
"@types/node": "^20.0.0",
"nock": "^14.0.0-beta.5",
"smee-client": "^2.0.0",
"typescript": "^5.3.3",
"vitest": "^1.3.1"
```

## Deployment Options

### Docker Deployment
- Containerized deployment with Docker
- Requires environment variables to be set
- Node.js v18+ base image
- Package installation optimization with npm ci

### GitHub Actions
- Potential deployment via GitHub Actions
- Automated testing in GitHub-hosted runners
- Secrets management for credentials

### Manual Deployment
- Direct deployment on Node.js hosting platforms
- Environment variable configuration
- Webhook endpoint must be publicly accessible
