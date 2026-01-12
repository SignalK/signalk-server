---
title: SuperClaude Framework
---

# SuperClaude Framework Setup Guide

This guide explains how to install and use the [SuperClaude Framework](https://github.com/SuperClaude-Org/SuperClaude_Framework) to enhance Claude Code with specialized commands, agents, and modes.

**Note:** This is optional and only applicable if you use Claude (Anthropic's AI). If you use Gemini, ChatGPT, or other AI assistants, skip this guide.

## What is SuperClaude?

SuperClaude is a meta-programming configuration framework that enhances Claude Code with:

- **31 Slash Commands** - Covering the entire development lifecycle
- **16 Specialized Agents** - Domain experts (PM, security, frontend, etc.)
- **7 Behavioral Modes** - Adapt Claude's responses to different contexts
- **Deep Research System** - Multi-hop reasoning with quality scoring

## Prerequisites

- [MCP Proxy](mcp-proxy.md) set up and running (optional but recommended)
- Python 3.8+
- Claude Code (Anthropic's CLI or VS Code extension)

## Installation

### Step 1: Install pipx

pipx is a tool for installing Python applications in isolated environments.

```bash
sudo apt install pipx
```

After installation, ensure pipx is in your PATH:

```bash
pipx ensurepath
source ~/.bashrc
```

Verify pipx is working:

```bash
pipx --version
```

### Step 2: Install SuperClaude

```bash
pipx install superclaude
```

### Step 3: Run SuperClaude Install

This installs the configuration files to your home directory:

```bash
superclaude install
```

### Step 4: Verify Installation

```bash
superclaude --version
```

### Step 5: Configure MCP Servers (Optional)

If you have MCP Proxy running, SuperClaude can integrate with it. List available servers:

```bash
superclaude mcp --list
```

Check MCP status:

```bash
superclaude mcp --status
```

## Usage

### Slash Commands

SuperClaude installs 31 slash commands. All commands use the `/sc:` prefix. Here are the main categories:

#### Planning & Design

| Command          | Description                       |
| ---------------- | --------------------------------- |
| `/sc:design`     | Design system architecture        |
| `/sc:spec-panel` | Multi-expert specification review |
| `/sc:workflow`   | Generate implementation workflows |
| `/sc:estimate`   | Development estimates             |
| `/sc:brainstorm` | Requirements discovery            |

#### Development

| Command         | Description                     |
| --------------- | ------------------------------- |
| `/sc:implement` | Feature and code implementation |
| `/sc:build`     | Build and compile projects      |
| `/sc:improve`   | Apply code improvements         |
| `/sc:cleanup`   | Clean up and optimize code      |

#### Testing & Quality

| Command            | Description                 |
| ------------------ | --------------------------- |
| `/sc:test`         | Execute tests with coverage |
| `/sc:analyze`      | Comprehensive code analysis |
| `/sc:troubleshoot` | Diagnose and resolve issues |

#### Research & Documentation

| Command        | Description                    |
| -------------- | ------------------------------ |
| `/sc:research` | Deep web research              |
| `/sc:explain`  | Clear explanations of code     |
| `/sc:document` | Generate documentation         |
| `/sc:index`    | Generate project documentation |

#### Git & Workflow

| Command    | Description                       |
| ---------- | --------------------------------- |
| `/sc:git`  | Git operations with smart commits |
| `/sc:task` | Task workflow management          |

#### Project Management

| Command              | Description           |
| -------------------- | --------------------- |
| `/sc:pm`             | Project manager agent |
| `/sc:business-panel` | Business analysis     |

#### Utilities

| Command                 | Description                   |
| ----------------------- | ----------------------------- |
| `/sc:help`              | List all commands             |
| `/sc:recommend`         | Suggest best command for task |
| `/sc:agent`             | Invoke specialized agents     |
| `/sc:spawn`             | Task orchestration            |
| `/sc:load` / `/sc:save` | Session management            |

### Example Workflows

#### Developing a Signal K Plugin

```
/sc:design Create a new plugin that converts NMEA 2000 temperature data to Signal K format

/sc:implement Follow the design to create the plugin

/sc:test Write unit tests for the temperature conversion

/sc:document Generate README for the plugin
```

#### Researching Signal K APIs

```
/sc:research Signal K v2 REST API for course management

/sc:research How do Signal K plugins emit deltas?
```

#### Debugging an Issue

```
/sc:troubleshoot The websocket connection drops after 5 minutes of inactivity
```

### Behavioral Modes

SuperClaude includes different modes that change how Claude responds:

| Mode         | Best For                   |
| ------------ | -------------------------- |
| `architect`  | System design and planning |
| `coder`      | Implementation focus       |
| `reviewer`   | Code review and quality    |
| `researcher` | Deep investigation         |
| `mentor`     | Learning and explanation   |

Switch modes in your prompt:

```
[mode: architect] Design a plugin architecture for handling multiple autopilot providers
```

### Specialized Agents

SuperClaude includes agents with domain expertise:

| Agent      | Expertise                          |
| ---------- | ---------------------------------- |
| `pm`       | Product management, requirements   |
| `security` | Security analysis, vulnerabilities |
| `frontend` | UI/UX, React, web components       |
| `backend`  | APIs, databases, servers           |
| `devops`   | CI/CD, deployment, infrastructure  |
| `qa`       | Testing, quality assurance         |

Invoke an agent:

```
[agent: security] Review this authentication implementation for vulnerabilities
```

## Signal K Development Tips

### Using Context7 for Documentation

Context7 provides up-to-date documentation lookup:

```
/sc:research use context7 to find Signal K specification for navigation.courseGreatCircle
```

### Browser Testing with Playwright

Test the Signal K web interface:

```
/sc:test Use playwright to verify the instrument panel renders correctly
```

### Deep Research with Tavily

Research implementation approaches:

```
/sc:research Deep dive into NMEA 2000 PGN 130312 temperature data format
```

## Configuration Files

SuperClaude reads context from markdown files in your project:

- `PLANNING.md` - Architecture and design decisions
- `TASK.md` - Current priorities and tasks
- `KNOWLEDGE.md` - Project-specific insights

Creating these files in your signalk-server directory will help SuperClaude understand your project context.

## Troubleshooting

### SuperClaude not recognized

Ensure pipx bin directory is in your PATH:

```bash
pipx ensurepath
source ~/.bashrc  # or restart terminal
```

### MCP servers not connecting

Check if the MCP Proxy is running:

```bash
systemctl --user status mcpproxy
```

Verify server status:

```bash
superclaude mcp --status
```

### Commands not working

Ensure you're using Claude Code (not the web interface). SuperClaude commands work in:

- Claude Code CLI
- Claude Code VS Code extension

## Resources

- [SuperClaude GitHub Repository](https://github.com/SuperClaude-Org/SuperClaude_Framework)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Claude Code Documentation](https://docs.anthropic.com/claude-code)
