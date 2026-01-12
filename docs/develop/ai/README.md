---
title: AI-Assisted Development
children:
  - mcp-proxy.md
  - superclaude.md
---

# AI-Assisted Development

This section documents how to set up AI tools to enhance your Signal K development workflow. The setup uses the Model Context Protocol (MCP) to provide AI assistants with access to development tools like GitHub, filesystem, git, web search, and more.

## What is MCP?

The [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) is an open standard that enables AI assistants to interact with external tools and data sources. By setting up MCP servers, you can give your AI assistant capabilities like:

- **GitHub integration** - Create issues, PRs, and manage repositories
- **Filesystem access** - Read and navigate your codebase
- **Git operations** - View diffs, history, and make commits
- **Web search** - Research documentation and solutions
- **Browser automation** - Test web interfaces
- **And more...**

## Setup Guides

### Required: MCP Proxy Setup

All users (regardless of which AI assistant you use) should start with the MCP Proxy setup:

**[MCP Proxy Setup Guide](mcp-proxy.md)** - Set up mcpproxy-go to expose MCP servers over HTTP. Works with:

- Claude (Anthropic)
- Gemini (Google)
- ChatGPT (OpenAI)
- Other MCP-compatible AI assistants

### Optional: SuperClaude Framework (Claude Users Only)

If you use Claude Code, you can optionally add the SuperClaude Framework for enhanced workflows:

**[SuperClaude Setup Guide](superclaude.md)** - Adds 30 slash commands, 16 specialized agents, and 7 behavioral modes specifically for Claude.

## Architecture Overview

```
┌─────────────────────────────────────────┐
│    SuperClaude Framework (Claude only)  │
│  (30 commands, 16 agents, 7 modes)      │
└─────────────────┬───────────────────────┘
                  │ (optional)
┌─────────────────▼───────────────────────┐
│     AI Client (Claude, Gemini, etc.)    │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│     MCP Proxy (http://localhost:8080)   │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│           11 MCP Servers                 │
│  GitHub, Filesystem, Git, Tavily,       │
│  Context7, Sequential-Thinking, Serena, │
│  Playwright, Magic, Morphllm, DevTools  │
└─────────────────────────────────────────┘
```

## Benefits for Signal K Development

With these tools configured, your AI assistant can:

- Research the Signal K specification and existing implementations
- Navigate and understand the signalk-server codebase
- Help develop and test plugins
- Create and manage GitHub issues and pull requests
- Generate documentation
- Run automated browser tests on the Signal K web interface
