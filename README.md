# Probot Aider Bot

A GitHub App built with [Probot](https://github.com/probot/probot) that automates issue resolution with the power of AI. This bot uses [Aider](https://github.com/paul-gauthier/aider) to generate code fixes based on GitHub issue descriptions.

## Features

- **Smart Mode Selection**: Automatically determines the best mode (architect, patcher, or hybrid) for handling each issue based on labels and content
- **Multi-Pass Processing**: Can perform architectural changes followed by detailed fixes for complex issues
- **Custom Repository Configurations**: Repositories can customize behavior through a config file
- **Visual Indicators**: Clear badges and labels to indicate which modes were used to fix issues
- **Interactive Commands**: Respond to issue comments to analyze or select specific processing modes

## How It Works

1. An issue is opened or labeled with a trigger label (e.g., `patchmycode:fix`)
2. The bot analyzes the issue to select the appropriate mode
3. Code changes are generated using Aider with the selected mode
4. A pull request is created with the changes
5. Visual badges show which modes were used in the PR

## Modes

### Architect Mode

![Architect](https://img.shields.io/badge/Architect-8A2BE2)

Designed for architectural changes, refactoring, and major restructuring. This mode focuses on:

- Improving code organization
- Implementing design patterns
- Enhancing overall architecture
- Refactoring for maintainability

### Patcher Mode

![Patcher](https://img.shields.io/badge/Patcher-2E8B57)

Focused on targeted bug fixes and immediate problem resolution. This mode emphasizes:

- Precise bug fixing
- Minimal changes
- Fast turnaround
- Preserving existing code structure

### Hybrid Modes

Special purpose modes for specific tasks:

- ![Security](https://img.shields.io/badge/Security-FF0000) **Security**: For vulnerability fixes and security improvements
- ![Performance](https://img.shields.io/badge/Performance-FFA500) **Performance**: For optimizing code and improving efficiency
- ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6) **TypeScript**: For TypeScript migrations and type improvements

## Commands

Use these commands in issue comments:

- `/analyze` - Analyze the issue and recommend the best mode
- `/mode architect` - Use architect mode for this issue
- `/mode patcher` - Use patcher mode for this issue
- `/mode hybrid:security` - Use security-focused hybrid mode
- `/mode hybrid:performance` - Use performance-focused hybrid mode
- `/mode hybrid:typescript` - Use TypeScript-focused hybrid mode
- `/mode multipass` - Use a multi-pass approach (architect followed by patcher)
- `/fix` - Fix the issue using the currently selected mode

## Configuration

Create a `.patchmycode/config.json` file in your repository to customize behavior:

```json
{
  "defaultMode": "patcher",
  "modeLabels": {
    "architect": ["architecture", "refactor", "design"],
    "patcher": ["bug", "fix", "typo"],
    "hybrid:security": ["security", "vulnerability"]
  },
  "systemPrompts": {
    "architect": "Custom system prompt for architect mode...",
    "patcher": "Custom system prompt for patcher mode..."
  },
  "modelMap": {
    "architect": "claude-3-7-sonnet",
    "patcher": "gpt-4o",
    "hybrid:security": "claude-3-opus-20240229"
  },
  "providerMap": {
    "architect": "anthropic",
    "patcher": "openai",
    "hybrid:security": "anthropic"
  }
}
```

## Setup

### Prerequisites

- Node.js 18+
- Aider installed (`pip install aider-chat`)
- GitHub App credentials
- OpenAI API key and/or Anthropic API key

### GitHub App Setup

1. Go to [GitHub Developer Settings](https://github.com/settings/apps) and click "New GitHub App"
2. Fill in the following details:
   - **GitHub App name**: Choose a name for your app (e.g., "My patchmycode App")
   - **Homepage URL**: Your website or repository URL
   - **Webhook URL**: The URL where GitHub will send webhook events (e.g., `https://your-domain.com/api/github/webhooks` or use [smee.io](https://smee.io) for development)
   - **Webhook secret**: Create a random string and save it for later
3. Set the following permissions:
   - **Repository permissions**:
     - **Contents**: Read & write (for creating branches and commits)
     - **Issues**: Read & write (for reading and commenting on issues)
     - **Pull requests**: Read & write (for creating PRs)
     - **Metadata**: Read-only
   - **Subscribe to events**:
     - **Issues**
     - **Issue comment**
     - **Label**
     - **Pull request**
4. Choose whether to install the app on all repositories or select repositories
5. Click "Create GitHub App"
6. After creation, note your **App ID** at the top of the page
7. Generate a **Private key** by clicking "Generate a private key" in the "Private keys" section
8. Install the app on your repositories by clicking "Install App" in the sidebar

### Installation

```bash
# Clone the repository
git clone https://github.com/stevengonsalvez/probot-aider-bot.git
cd probot-aider-bot

# Install dependencies
npm install

# Copy the example environment file
cp .env.example .env

# Edit the .env file with your GitHub App credentials and API keys
# Set APP_ID, PRIVATE_KEY, WEBHOOK_SECRET, and API keys

# Run the bot
npm start
```

### Environment Variables

#### Core Configuration
- `APP_ID`: Your GitHub App ID
- `PRIVATE_KEY`: Your GitHub App's private key
- `WEBHOOK_SECRET`: Your GitHub App's webhook secret
- `WEBHOOK_PROXY_URL`: URL for webhook proxying (for local development with smee.io)
- `LOG_LEVEL`: Logging level (`debug`, `info`, `warn`, or `error`)

#### API Keys Configuration
You can configure multiple API providers:

- **OpenAI Configuration**:
  - `OPENAI_API_KEY`: Single API key for OpenAI models
  - `OPENAI_API_KEYS`: Multiple comma-separated keys for load balancing

- **Anthropic Configuration**:
  - `ANTHROPIC_API_KEY`: Single API key for Claude models
  - `ANTHROPIC_API_KEYS`: Multiple comma-separated keys for load balancing

- **OpenRouter Configuration**:
  - `OPENROUTER_API_KEY`: API key for accessing multiple models through OpenRouter

#### Model Configuration
You can set models globally or per mode:

- **Global model setting**:
  - `PATCH_MODEL`: Default model for all modes if no mode-specific model is set

- **Mode-specific models**:
  - `PATCH_MODEL_ARCHITECT`: Model for architect mode
  - `PATCH_MODEL_PATCHER`: Model for patcher mode
  - `PATCH_MODEL_HYBRID_SECURITY`: Model for security hybrid mode
  - `PATCH_MODEL_HYBRID_PERFORMANCE`: Model for performance hybrid mode
  - `PATCH_MODEL_HYBRID_TYPESCRIPT`: Model for TypeScript hybrid mode

- **Model provider configuration**:
  - `PATCH_MODEL_PROVIDER`: Explicitly specify which provider to use (openai, anthropic, openrouter)
  - `PATCH_MODEL_PROVIDER_ARCHITECT`: Provider for architect mode
  - `PATCH_MODEL_PROVIDER_PATCHER`: Provider for patcher mode
  - `PATCH_MODEL_PROVIDER_HYBRID_SECURITY`: Provider for security hybrid mode
  - `PATCH_MODEL_PROVIDER_HYBRID_PERFORMANCE`: Provider for performance hybrid mode
  - `PATCH_MODEL_PROVIDER_HYBRID_TYPESCRIPT`: Provider for TypeScript hybrid mode

- **Model-specific arguments**:
  - `PATCH_EXTRA_ARGS`: Global extra arguments for Aider
  - `PATCH_EXTRA_ARGS_ARCHITECT`: Arguments specific to architect mode
  - `PATCH_EXTRA_ARGS_PATCHER`: Arguments specific to patcher mode
  - `PATCH_EXTRA_ARGS_HYBRID_SECURITY`: Arguments specific to security mode

### Mode Selection
To set the default mode and mode selection behavior:

- `PATCH_DEFAULT_MODE`: Default processing mode (`architect`, `patcher`, or a hybrid mode)
- `PATCH_ENABLE_MULTIPASS`: Whether to enable multi-pass processing for complex issues
- `PATCH_MULTIPASS_SEQUENCE`: The sequence of modes for multi-pass processing

## Development

```bash
# Run with hot reload
npm run dev

# Run tests
npm test
```

### Using smee.io for Local Development

1. Go to [smee.io](https://smee.io) and click "Start a new channel"
2. Copy the URL and set it as `WEBHOOK_PROXY_URL` in your `.env` file
3. Install the smee client: `npm install -g smee-client`
4. Run the client: `smee -u https://smee.io/your-channel -t http://localhost:3000/api/github/webhooks`
5. Start your Probot app in another terminal: `npm start`

## Deployment

### Docker Deployment

```bash
# Build the Docker image
docker build -t patchmycode .

# Run the Docker container
docker run -p 3000:3000 --env-file .env patchmycode
```

### Deploying to Services

- **Heroku**: Push to Heroku with the Procfile included
- **Fly.io**: Deploy with the included fly.toml
- **GitHub Actions**: Deploy using GitHub Actions workflows
- **Vercel/Netlify**: Deploy serverless with adapter

## License

[ISC](LICENSE) © 2025 steven gonsalvez
