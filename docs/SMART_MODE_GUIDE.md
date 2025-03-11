# Smart Mode Selection Guide

This guide explains how to effectively use the smart mode selection system to get the best AI-powered fixes for your issues.

## Understanding Modes

The bot offers several modes, each optimized for different types of code changes:

### 🏛️ Architect Mode

![Architect](https://img.shields.io/badge/Architect-8A2BE2)

**Best for:** Large-scale changes, refactoring, code organization, and design pattern implementation.

**When to use:** 
- You need significant restructuring of code
- The issue involves design patterns or architecture
- Multiple files need to be modified in a cohesive way
- Technical debt needs addressing

**Example keywords in issue:** refactor, redesign, architecture, pattern, decouple, restructure

### 🔧 Patcher Mode

![Patcher](https://img.shields.io/badge/Patcher-2E8B57)

**Best for:** Targeted bug fixes, small feature additions, and precision changes.

**When to use:**
- The issue is a specific bug with clear boundaries
- You need a minimal, precise fix
- The change should be confined to a small area
- Risk of regression should be minimized

**Example keywords in issue:** bug, fix, issue, error, typo, crash, incorrect behavior

### 🧰 Hybrid Modes

Specialized modes for specific types of changes:

- ![Security](https://img.shields.io/badge/Security-FF0000) **Security Mode**: For security vulnerabilities, input validation, or authentication issues
- ![Performance](https://img.shields.io/badge/Performance-FFA500) **Performance Mode**: For optimizing slow code, improving algorithms, or reducing resource usage
- ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6) **TypeScript Mode**: For improving type safety, adding types, or migrating to TypeScript

### 🔄 Multi-pass Processing

For complex issues, the bot can use a multi-pass approach:
1. First pass with architect mode to implement structural changes
2. Second pass with patcher mode to fine-tune the implementation

## How to Select a Mode

### Automatic Selection (Recommended)

By default, the bot automatically analyzes your issue and selects the appropriate mode. It looks at:
- Issue labels
- Keywords in the title and description
- Code blocks in the issue
- Repository configuration

### Using Labels

Add one of these labels to your issue to explicitly select a mode:
- `patchmycode:architect` - Use architect mode
- `patchmycode:patcher` - Use patcher mode
- `patchmycode:multipass` - Use multi-pass approach
- `security` or `vulnerability` - Use security hybrid mode
- `performance` or `optimization` - Use performance hybrid mode
- `typescript-migration` or `type-safety` - Use TypeScript hybrid mode

### Using Commands in Comments

Comment on your issue with one of these commands:
- `/analyze` - Get a recommendation for the best mode to use
- `/mode architect` - Use architect mode
- `/mode patcher` - Use patcher mode
- `/mode hybrid:security` - Use security hybrid mode
- `/mode hybrid:performance` - Use performance hybrid mode
- `/mode hybrid:typescript` - Use TypeScript hybrid mode
- `/mode multipass` - Use multi-pass approach
- `/fix` - Fix the issue using the currently selected or default mode

### Mode Hints in Issue Description

Include a section in your issue description with mode hints:

```
## Mode Hints
- I suggest using architect mode for this issue
```

## Tips for Getting Better Fixes

1. **Be specific** in your issue description - clearly state what needs to be fixed
2. **Include code examples** where relevant - showing the problematic code helps
3. **Explain the desired outcome** - what should the fixed code do?
4. **Use appropriate labels** to guide the mode selection
5. **Consider the scope** - if your issue is large, consider breaking it into smaller issues or using multi-pass mode
6. **Provide context** - explain why the change is needed and any constraints

## Repository Configuration

Repository maintainers can customize the mode selection behavior by creating a `.patchmycode/config.json` file. This allows you to:

- Set a default mode for your repository
- Define custom label mappings to modes
- Configure custom system prompts for each mode
- Map specific modes to different AI models

See the main README for configuration details. 