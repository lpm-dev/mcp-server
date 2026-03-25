# @lpm-registry/mcp-server

MCP (Model Context Protocol) server for the [LPM](https://lpm.dev) package registry. Gives AI tools like Claude Code, Cursor, and other MCP-compatible agents access to search, browse source code, install packages, check quality, and more.

## Quick Setup

If you have the [LPM CLI](https://lpm.dev/docs/cli) installed, one command configures all your editors:

```bash
lpm mcp setup
```

This auto-detects Claude Code, Cursor, VS Code, Claude Desktop, and Windsurf, then writes the correct config to each. Authentication is handled via `lpm login` (stored in your OS keychain) — no tokens in config files.

If your CLI is configured to use a custom registry URL (for example local dev), `lpm mcp setup` automatically writes `LPM_REGISTRY_URL` into MCP config so editor-launched MCP processes hit the same registry.

## Manual Setup

If you prefer manual configuration, add to your editor's MCP config:

### Claude Code

```json
{
  "mcpServers": {
    "lpm-registry": {
      "command": "npx",
      "args": ["-y", "@lpm-registry/mcp-server@latest"]
    }
  }
}
```

### Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "lpm-registry": {
      "command": "npx",
      "args": ["-y", "@lpm-registry/mcp-server@latest"]
    }
  }
}
```

### VS Code (`.vscode/mcp.json`)

```json
{
  "servers": {
    "lpm-registry": {
      "command": "npx",
      "args": ["-y", "@lpm-registry/mcp-server@latest"]
    }
  }
}
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "lpm-registry": {
      "command": "npx",
      "args": ["-y", "@lpm-registry/mcp-server@latest"]
    }
  }
}
```

## Authentication

The server reads your token from the OS keychain (set by `lpm login`). No token in config files required.

Alternatively, set the `LPM_TOKEN` environment variable for environments without keychain access:

```bash
export LPM_TOKEN=lpm_your_token_here
```

### Registry URL

Defaults to `https://lpm.dev`. Override with:

```bash
export LPM_REGISTRY_URL=https://your-registry.dev
```

For local development, copy `.env.example` to `.env.local` and set your local registry URL. These files are gitignored.

## Available Tools

| Tool                    | Description                                                             | Auth     | Cache |
| ----------------------- | ----------------------------------------------------------------------- | -------- | ----- |
| `lpm_search`            | Search packages with natural language or structured filters             | Optional | 5m    |
| `lpm_package_info`      | Get package metadata, install method, access model, and readme          | Optional | 5m    |
| `lpm_api_docs`          | Get structured API docs — functions, classes, types, signatures         | Optional | 5m    |
| `lpm_llm_context`       | Get LLM-optimized usage guide — quickStart, patterns, gotchas           | Optional | 5m    |
| `lpm_package_context`   | Get complete package context in one call (pre-install evaluation)       | Optional | 5m    |
| `lpm_package_skills`    | Get Agent Skills for building with an installed package                 | Optional | 5m    |
| `lpm_docs`              | Search or read LPM documentation (setup, CLI, publishing, etc.)         | No       | 30m   |
| `lpm_browse_source`     | Browse package source code remotely (last resort)                       | Yes      | 5m    |
| `lpm_add`               | Add a package by extracting source files into the project               | Yes      | —     |
| `lpm_install`           | Install a managed dependency (JS → node_modules, Swift → Package.swift) | Yes      | —     |
| `lpm_audit`             | Security audit — behavioral tags, AI findings, quality scores           | Yes      | —     |
| `lpm_marketplace_info`  | Marketplace pricing, licensing, and seat management                     | Optional | 5m    |
| `lpm_quality_report`    | Get quality score and 28-check breakdown                                | Optional | 5m    |
| `lpm_search_owners`     | Search for users or organizations by name                               | No       | 5m    |
| `lpm_packages_by_owner` | List packages published by a specific user or org                       | No       | 5m    |
| `lpm_pool_stats`        | Get your Pool revenue earnings for the current month                    | Yes      | 1h    |
| `lpm_user_info`         | Get authenticated user info, orgs, and usage                            | Yes      | 5m    |

### Access Control

- **Pool packages** require a Pool subscription ($12/mo). Without one, `lpm_browse_source`, `lpm_add`, and `lpm_install` return an error with subscription info.
- **Marketplace packages** require a license purchase. Errors include a link to the package page.
- **Public metadata** (`lpm_package_info`, `lpm_search`, `lpm_quality_report`) works without auth for public packages.

## Troubleshooting

**"No LPM token found"**
Set the `LPM_TOKEN` environment variable in your MCP client configuration, or run `lpm login` first.

**"Authentication required"**
Some tools (`lpm_browse_source`, `lpm_add`, `lpm_install`) require authentication. Run `lpm login` or set `LPM_TOKEN`.

**"Authentication failed"**
Your token may be expired or revoked. Generate a new token at https://lpm.dev/dashboard/tokens or run `lpm login`.

**"Cannot reach lpm.dev"**
Check your internet connection. If you're behind a proxy, ensure it allows HTTPS connections to lpm.dev.

**"Package not found"**
Verify the package name format: `owner.package-name` (e.g., `alice.ui-kit`).

**"Rate limit exceeded"**
Source browsing is rate limited to 30 requests per minute. Wait and retry.

**"Source browsing is currently disabled"**
The registry has temporarily disabled source browsing. Try again later.

**"Response was truncated"**
Use the `path` parameter with `lpm_browse_source` to request specific files or directories instead of the entire package.
