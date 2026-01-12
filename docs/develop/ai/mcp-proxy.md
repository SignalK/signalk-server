---
title: MCP Proxy Setup
---

# MCP Proxy Setup Guide

This guide explains how to set up [mcpproxy-go](https://github.com/smart-mcp-proxy/mcpproxy-go) on Debian/Linux to expose MCP servers over HTTP. This setup works with any MCP-compatible AI assistant including Claude, Gemini, and others.

## Prerequisites

- Debian/Ubuntu Linux (or similar)
- Node.js 18+ and npm installed
- A GitHub account (for GitHub MCP server)
- Keyring support (for secure secret storage):
  ```bash
  sudo apt install gnome-keyring libsecret-1-0 dbus-x11
  ```

## Installation

### Option 1: Download Binary (Recommended)

```bash
# Download latest release
wget https://github.com/smart-mcp-proxy/mcpproxy-go/releases/latest/download/mcpproxy-latest-linux-amd64.tar.gz

# Extract
tar xzf mcpproxy-latest-linux-amd64.tar.gz

# Install to user directory
mkdir -p ~/.local/bin
mv mcpproxy ~/.local/bin/

# Add to PATH (if not already)
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Clean up
rm mcpproxy-latest-linux-amd64.tar.gz

# Verify installation
mcpproxy --version
```

### Option 2: Go Install

If you have Go installed:

```bash
go install github.com/smart-mcp-proxy/mcpproxy-go/cmd/mcpproxy@latest
```

## Configuration

Create the configuration directory and file:

```bash
mkdir -p ~/.mcpproxy
```

Create `~/.mcpproxy/mcp_config.json`:

```json
{
  "listen": "0.0.0.0:8080",
  "mcpServers": [
    {
      "name": "github",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${keyring:github_token}"
      },
      "enabled": true
    },
    {
      "name": "filesystem",
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/home/YOUR_USER/dev"
      ],
      "enabled": true
    },
    {
      "name": "git",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-git"],
      "working_dir": "/home/YOUR_USER/dev/signalk-server",
      "enabled": true
    },
    {
      "name": "tavily",
      "command": "npx",
      "args": ["-y", "tavily-mcp"],
      "env": {
        "TAVILY_API_KEY": "${keyring:tavily_api_key}"
      },
      "enabled": true
    },
    {
      "name": "context7",
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"],
      "env": {
        "UPSTASH_API_KEY": "${keyring:upstash_api_key}"
      },
      "enabled": true
    },
    {
      "name": "sequential-thinking",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"],
      "enabled": true
    },
    {
      "name": "serena",
      "command": "npx",
      "args": ["-y", "serena"],
      "enabled": true
    },
    {
      "name": "playwright",
      "command": "npx",
      "args": ["-y", "@playwright/mcp"],
      "enabled": true
    },
    {
      "name": "magic",
      "command": "npx",
      "args": ["-y", "@21st-dev/magic"],
      "env": {
        "MAGIC_API_KEY": "${keyring:magic_api_key}"
      },
      "enabled": true
    },
    {
      "name": "morphllm",
      "command": "npx",
      "args": ["-y", "@morph-llm/morph-fast-apply"],
      "env": {
        "MORPH_API_KEY": "${keyring:morph_api_key}"
      },
      "enabled": true
    },
    {
      "name": "chrome-devtools",
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp"],
      "enabled": true
    }
  ]
}
```

**Note:** Replace `YOUR_USER` with your actual username, and adjust paths as needed.

## API Keys

Several MCP servers require API keys. There are two ways to store them securely.

### Option 1: System Keyring (Recommended)

Install keyring support on your system:

```bash
# Debian/Ubuntu with desktop environment
sudo apt install gnome-keyring libsecret-1-0

# Or for headless servers with D-Bus
sudo apt install gnome-keyring libsecret-1-0 dbus-x11
```

Then store your API keys using the mcpproxy keyring:

```bash
# Store each API key (you'll be prompted to paste the key)
mcpproxy secrets set github_token
mcpproxy secrets set tavily_api_key
mcpproxy secrets set upstash_api_key
mcpproxy secrets set magic_api_key
mcpproxy secrets set morph_api_key
```

Your config file should use `${keyring:secret_name}` syntax (shown in the example above).

### Option 2: Environment File (Headless Servers)

If keyring is not available (e.g., headless servers without D-Bus), use an environment file:

1. Create a secrets file:

```bash
touch ~/.mcpproxy/secrets.env
chmod 600 ~/.mcpproxy/secrets.env
```

2. Add your API keys:

```bash
# ~/.mcpproxy/secrets.env
GITHUB_TOKEN=ghp_your_token_here
TAVILY_API_KEY=your_tavily_key_here
UPSTASH_API_KEY=your_upstash_key_here
MAGIC_API_KEY=your_magic_key_here
MORPH_API_KEY=your_morph_key_here
```

3. Update your config to use `${env:VAR_NAME}` instead of `${keyring:secret_name}`:

```json
"env": {
  "GITHUB_PERSONAL_ACCESS_TOKEN": "${env:GITHUB_TOKEN}"
}
```

4. Add `EnvironmentFile` to your systemd service (see systemd section below).

### Where to Get API Keys

| Service | Signup URL                                                       | Notes                                    |
| ------- | ---------------------------------------------------------------- | ---------------------------------------- |
| GitHub  | [github.com/settings/tokens](https://github.com/settings/tokens) | Personal Access Token (see scopes below) |

#### GitHub Token Scopes

For full GitHub MCP functionality, create a **classic** Personal Access Token with these scopes:

| Scope             | Purpose                                              |
| ----------------- | ---------------------------------------------------- |
| `repo`            | Full repository access (code, issues, PRs, releases) |
| `workflow`        | GitHub Actions workflows                             |
| `read:org`        | Read organization membership                         |
| `read:user`       | Read user profile                                    |
| `gist`            | Create and manage gists                              |
| `notifications`   | Access notifications                                 |
| `project`         | Manage projects                                      |
| `security_events` | Code scanning and security alerts (optional)         |

**Minimum scopes** for basic use: `repo`, `read:org`, `read:user`

**Recommended scopes** for full CI/CD: Add `workflow`, `project`

#### Other API Keys

| Service            | Signup URL                           | Notes                            |
| ------------------ | ------------------------------------ | -------------------------------- |
| Tavily             | [tavily.com](https://tavily.com)     | Web search API for deep research |
| Context7 (Upstash) | [upstash.com](https://upstash.com)   | Documentation lookup service     |
| Magic              | [21st.dev](https://21st.dev)         | UI component generation          |
| Morphllm           | [morphllm.com](https://morphllm.com) | Code modification service        |

## Running as a Systemd Service

Create a user systemd service to run mcpproxy automatically on login:

```bash
mkdir -p ~/.config/systemd/user
```

Create `~/.config/systemd/user/mcpproxy.service`:

### If using keyring (Option 1):

```ini
[Unit]
Description=MCP Proxy Server
After=network.target

[Service]
Type=simple
ExecStart=/home/YOUR_USER/.local/bin/mcpproxy serve
Restart=on-failure
RestartSec=5
Environment=PATH=/home/YOUR_USER/.local/bin:/usr/local/bin:/usr/bin:/bin
Environment=HOME=/home/YOUR_USER

[Install]
WantedBy=default.target
```

### If using environment file (Option 2):

```ini
[Unit]
Description=MCP Proxy Server
After=network.target

[Service]
Type=simple
ExecStart=/home/YOUR_USER/.local/bin/mcpproxy serve
Restart=on-failure
RestartSec=5
Environment=PATH=/home/YOUR_USER/.local/bin:/usr/local/bin:/usr/bin:/bin
Environment=HOME=/home/YOUR_USER
EnvironmentFile=/home/YOUR_USER/.mcpproxy/secrets.env

[Install]
WantedBy=default.target
```

Enable and start the service:

```bash
systemctl --user daemon-reload
systemctl --user enable mcpproxy
systemctl --user start mcpproxy
```

Check status:

```bash
systemctl --user status mcpproxy
```

View logs:

```bash
journalctl --user -u mcpproxy -f
```

## Manual Execution

To run mcpproxy manually (for testing):

```bash
mcpproxy serve
```

## Connecting Your AI Client

Once your MCP proxy is running, configure your AI client to connect to it. This single configuration replaces any individual MCP server entries you had before - all servers are now accessible through the proxy.

### Claude Code for VS Code

**Option 1: Project-level config (recommended)**

Create or edit `.vscode/mcp.json` in your project folder:

```json
{
  "mcpServers": {
    "mcpproxy": {
      "type": "http",
      "url": "http://YOUR_SERVER_IP:8080/mcp"
    }
  }
}
```

**Option 2: Global config (all projects)**

Edit `~/.claude.json` and add/update the `mcpServers` section:

```json
{
  "mcpServers": {
    "mcpproxy": {
      "type": "http",
      "url": "http://YOUR_SERVER_IP:8080/mcp"
    }
  }
}
```

Example for a server at 192.168.0.122:

```json
{
  "mcpServers": {
    "mcpproxy": {
      "type": "http",
      "url": "http://192.168.0.122:8080/mcp"
    }
  }
}
```

After updating the config, reload VS Code (`Ctrl+Shift+P` → "Developer: Reload Window").

### Claude Desktop

Edit your Claude Desktop configuration file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mcpproxy": {
      "type": "http",
      "url": "http://YOUR_SERVER_IP:8080/mcp"
    }
  }
}
```

### Other AI Clients (Gemini, etc.)

Consult your AI client's documentation for connecting to MCP servers via HTTP. The endpoint URL is:

```
http://YOUR_SERVER_IP:8080/mcp
```

## Web UI

MCPProxy includes a web interface for managing servers and viewing status. Access it at:

```
http://localhost:8080/ui/
```

### Web UI Authentication

The web UI requires an API key for authentication. When mcpproxy starts for the first time, it auto-generates an API key and stores it in the config file.

To find your API key:

```bash
grep "api_key" ~/.mcpproxy/mcp_config.json
```

Then access the UI with the key:

```
http://localhost:8080/ui/?apikey=YOUR_API_KEY
```

Or paste the key into the authentication prompt in the browser.

## Verification

1. Check if the service is running:

   ```bash
   systemctl --user status mcpproxy
   ```

2. Test the HTTP endpoint:

   ```bash
   curl http://localhost:8080/mcp/
   ```

3. Access the web UI (with API key):
   ```bash
   # Get your API key
   grep "api_key" ~/.mcpproxy/mcp_config.json
   # Then open: http://localhost:8080/ui/?apikey=YOUR_KEY
   ```

## MCP Servers Reference

| Server                  | Purpose                            |
| ----------------------- | ---------------------------------- |
| **github**              | GitHub API - issues, PRs, repos    |
| **filesystem**          | Read files in your dev directory   |
| **git**                 | Git operations - diff, log, status |
| **tavily**              | Deep web research and search       |
| **context7**            | Official documentation lookup      |
| **sequential-thinking** | Multi-step reasoning               |
| **serena**              | Session persistence and memory     |
| **playwright**          | Browser automation and testing     |
| **magic**               | UI component generation            |
| **morphllm**            | Context-aware code modifications   |
| **chrome-devtools**     | Performance analysis               |

## Troubleshooting

### Service won't start

Check logs:

```bash
journalctl --user -u mcpproxy -n 50
```

Common issues:

- Missing Node.js/npm
- Invalid JSON in config file
- Missing API keys in keyring

### Keyring not available

If you see errors about keyring/secrets not being accessible:

1. Install keyring packages:

   ```bash
   sudo apt install gnome-keyring libsecret-1-0
   ```

2. Or switch to environment file approach (see API Keys section above)

### Connection refused

- Ensure the service is running
- Check firewall settings if accessing remotely
- Verify the listen address in config (0.0.0.0 for remote access)

### MCP server errors

Individual servers may fail if:

- Required npm packages can't be downloaded
- API keys are missing or invalid
- Required dependencies aren't installed (e.g., Chrome for chrome-devtools)
