# patchmycode

> A GitHub App built with [Probot](https://github.com/probot/probot) that automatically fixes code issues with specific labels.

## Overview

The patchmycode bot is a GitHub App that automates issue resolution by leveraging AI-powered code fixes. When an issue is labeled with a trigger label (e.g., `fix:auto`), the bot:

1. Clones the repository
2. Uses AI to analyze the issue description and generate a fix
3. Creates a pull request with the proposed changes
4. Comments on the issue with a link to the PR

This automation helps reduce manual work for developers by providing automatic fixes for suitable issues.

## Prerequisites

- Node.js 18+ and npm
- A GitHub account
- [Aider](https://aider.chat) installed (`pip install aider-chat`) (used as the underlying AI code assistant)
- Access to an OpenAI/Anthropic API key for Aider to use

## Setup

### Local Development

```sh
# Clone the repository
git clone https://github.com/your-username/patchmycode.git
cd patchmycode

# Install dependencies
npm install

# Copy and configure the environment file
cp .env.example .env
# Edit .env to set your API keys and configuration

# Start the app
npm start
```

### GitHub App Registration

1. Go to your GitHub account settings
2. Navigate to Developer Settings > GitHub Apps > New GitHub App
3. Fill in the required information:
   - App name
   - Homepage URL (can be repository URL)
   - Webhook URL (for local development, use a service like [smee.io](https://smee.io))
   - Permissions:
     - Repository contents: Read & write
     - Issues: Read & write
     - Pull requests: Read & write
   - Subscribe to events:
     - Issues
     - Issue comment
     - Pull request
4. Create the app and note the App ID
5. Generate a private key and download it
6. Update your `.env` file with the App ID and path to the private key

### Environment Variables

See the `.env.example` file for all available configuration options. The most important ones are:

- `APP_ID`: Your GitHub App ID
- `WEBHOOK_SECRET`: Secret for webhook verification
- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`: Required for AI code generation to function
- `PATCH_TRIGGER_LABEL`: The label that triggers the bot to fix an issue (default: `fix:auto`)

## Usage

1. Install the GitHub App on your repository
2. Create or find an issue that can be automatically fixed
3. Add the trigger label (default: `fix:auto`) to the issue
4. The bot will:
   - Comment that it's working on the issue
   - Use AI to generate a fix
   - Create a pull request with the changes
   - Comment on the issue with the PR link

## Advanced Configuration

### Labels

- `PATCH_TRIGGER_LABEL`: Primary label that triggers fixes (default: `fix:auto`)
- `PATCH_ADDITIONAL_TRIGGER_LABELS`: Additional labels that can also trigger fixes
- `AIDER_PR_LABELS`: Labels to add to created pull requests

### Comments

- `AIDER_PROCESSING_COMMENT`: Comment to add when processing starts
- `AIDER_SUCCESS_COMMENT`: Comment to add on successful fix
- `AIDER_FAILURE_COMMENT`: Comment to add when fix fails

### AI Model Configuration

- `PATCH_MODEL`: LLM model to use (default: `gpt-4o`)
- `PATCH_EXTRA_ARGS`: Additional arguments to pass to the AI engine
- `PATCH_TIMEOUT`: Timeout for AI operations in milliseconds (default: 300000)

### Pull Requests

- `AIDER_BRANCH_PREFIX`: Prefix for branches created by the bot (default: `aider-fix-`)
- `AIDER_PR_TITLE_PREFIX`: Prefix for PR titles (default: `Fix: `)
- `AIDER_PR_DRAFT`: Whether to create PRs as drafts (default: `false`)

## Docker

```sh
# 1. Build container
docker build -t patchmycode .

# 2. Start container
docker run -e APP_ID=<app-id> -e PRIVATE_KEY=<pem-value> -e OPENAI_API_KEY=<key> patchmycode
```

## Troubleshooting

### AI Backend Installation

This application uses Aider as the AI backend. If you encounter issues, ensure it's correctly installed:

```sh
pip install aider-chat
aider --version
```

### GitHub Authentication

For private repositories, the bot needs authentication. Make sure your GitHub App has the necessary permissions.

### API Keys

Aider requires either an OpenAI or Anthropic API key. Set them in your environment variables:

```
OPENAI_API_KEY=your-key-here
# or
ANTHROPIC_API_KEY=your-key-here
```

### Using Claude/Anthropic Models

To use Claude models, you need to:

1. Set your Anthropic API key:
   ```
   ANTHROPIC_API_KEY=your-anthropic-key-here
   ```

2. Set the model to a Claude model:
   ```
   AIDER_MODEL=claude-3-7-sonnet-20250219
   ```

3. **Important**: Add the `--use-anthropic` flag to the extra arguments:
   ```
   AIDER_EXTRA_ARGS=--use-anthropic
   ```

All three settings are required for Claude models to work correctly. If you encounter errors about missing OpenAI API keys while using Claude, double-check that you've added the `--use-anthropic` flag to your `AIDER_EXTRA_ARGS`.

## Contributing

If you have suggestions for how probot-aider-bot could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[ISC](LICENSE) © 2025 steven gonsalvez
