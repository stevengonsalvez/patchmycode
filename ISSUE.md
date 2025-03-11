# Extend Aider Integration to Support Additional LLM Models (Gemini, Qwen, Deepseek, Codestral)

## Background
Currently, patchmycode supports OpenAI models (like GPT-4) and Anthropic/Claude models. With the rapid evolution of coding-focused LLMs, we should expand support to include additional high-performance models that may offer different capabilities, pricing models, or regional availability.

## Objective
Extend the Aider integration to support additional LLM models:
- Google's Gemini
- Qwen from Alibaba
- Deepseek
- Codestral

## Requirements
1. Update the `PatchClient` to properly detect and configure these new models
2. Add appropriate environment variables and configuration options for each model's API keys
3. Implement model-specific command line arguments for Aider
4. Handle error messages specific to each model provider
5. Update documentation to include setup instructions for each model
6. Add examples of how to configure each model type

## Implementation Details
For each new model:
1. Add detection logic in `isClaudeModel()` or create new detection methods (e.g., `isGeminiModel()`)
2. Update environment variable handling for new API keys
3. Add model-specific flags in the Aider command construction
4. Improve error handling to include model-specific error messages
5. Test each model with simple fix scenarios

## Configuration Updates
Add new environment variables to `.env.example`:
```
# Google Gemini API
GOOGLE_API_KEY=

# Qwen API
QWEN_API_KEY=

# Deepseek API
DEEPSEEK_API_KEY=

# Codestral API
CODESTRAL_API_KEY=
```

## Documentation Updates
1. Update README.md with setup instructions for each model
2. Add model-specific troubleshooting sections
3. **Update progress.md** to reflect the new supported models

## Testing
1. Test each model with simple issue fixes
2. Verify error handling when API keys are missing or invalid
3. Ensure configuration options work correctly

## Acceptance Criteria
- All models can be configured and used through environment variables
- Error messages are clear and specific to each model
- Documentation is comprehensive and updated
- **progress.md is updated** to reflect the new capabilities
- PR includes examples for configuring each model

## Dependencies
- May require updates to Aider itself or specific versions of Aider that support these models
- Requires API keys for testing each model

/cc @stevengonsalvez