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

| Tool                      | Description                                                     | Auth Required |
| ------------------------- | --------------------------------------------------------------- | ------------- |
| `lpm_search`              | Search packages with natural language or structured filters     | Optional      |
| `lpm_package_info`        | Get package metadata, install method, access model, and readme  | Optional      |
| `lpm_browse_source`       | Browse package source code — file tree and file contents        | Yes           |
| `lpm_add`                 | Add a package by extracting source files into the project       | Yes           |
| `lpm_install`             | Install a package as a dependency to node_modules               | Yes           |
| `lpm_get_install_command` | Get the correct CLI command (`lpm add` vs `lpm install`)        | Optional      |
| `lpm_quality_report`      | Get quality score and 27-check breakdown                        | Optional      |
| `lpm_search_owners`       | Search for users or organizations by name                       | No            |
| `lpm_packages_by_owner`   | List packages published by a specific user or org               | No            |
| `lpm_pool_stats`          | Get your Pool revenue earnings for the current month            | Yes           |
| `lpm_user_info`           | Get authenticated user info, orgs, and usage                    | Yes           |

## AI Workflow

A typical AI agent workflow for finding and adding a package:

1. **Search** — `lpm_search` to find packages matching the need
2. **Inspect** — `lpm_package_info` to check the install method, access model, and readme
3. **Browse** — `lpm_browse_source` (tree first, then specific files) to understand code structure
4. **Install** — `lpm_add` for components/blocks/Swift or `lpm_install` for dependencies

The `lpm_package_info` response includes `installMethod.command` (`lpm add` or `lpm install`) so agents know which tool to use.

### Access Control

- **Pool packages** require a Pool subscription ($12/mo). Without one, `lpm_browse_source`, `lpm_add`, and `lpm_install` return an error with subscription info.
- **Marketplace packages** require a license purchase. Errors include a link to the package page.
- **Public metadata** (`lpm_package_info`, `lpm_search`, `lpm_quality_report`) works without auth for public packages.

## Tool Details

### lpm_search

Search LPM packages using natural language or structured filters. Uses hybrid semantic search for natural language queries, and the explore API when structured filters are active.

**Parameters:**

- `query` (string, optional) — Natural language search query (required unless `category` is provided)
- `category` (string, optional) — Package category filter (e.g., `ui-components`, `tools`)
- `ecosystem` (enum, optional) — Filter by ecosystem: `js`, `swift`, or `xcframework`
- `distribution` (enum, optional) — Filter by distribution mode: `marketplace`, `pool`, or `private`
- `packageType` (enum, optional) — Filter by type: `package`, `source`, `mcp-server`, `vscode-extension`, `cursor-rules`, `github-action`, `xcframework`, `other`
- `sort` (enum, optional) — Sort order: `newest`, `popular`, or `name`
- `hasTypes` (boolean, optional) — Filter to packages with TypeScript type definitions
- `moduleType` (enum, optional) — Filter by module type: `esm`, `cjs`, or `dual`
- `license` (enum, optional) — Filter by license: `MIT`, `Apache-2.0`, `ISC`, `GPL-3.0`, `BSD-3-Clause`, `Unlicense`
- `minNodeVersion` (enum, optional) — Filter to packages supporting Node.js `18`, `20`, or `22`+
- `limit` (number, optional) — Max results, 1-50 (default: 10)

At least one of `query` or `category` is required.

**Example response:**

```
Found 2 packages:

- alice.ui-kit [source] (pool) — React UI components (5,000 downloads)
  Quality: 88 | Category: ui-components | Tags: react, components
- bob.form-builder (marketplace) — Form builder library (1,200 downloads)
```

### lpm_package_info

Get metadata for an LPM package including versions, description, downloads, install method, access status, and readme.

**Parameters:**

- `name` (string, required) — Package name in `owner.package-name` or `@lpm.dev/owner.package-name` format

**Example response:**

```json
{
  "name": "@lpm.dev/alice.ui-kit",
  "description": "A modern UI component kit for React",
  "ecosystem": "js",
  "latestVersion": "2.1.0",
  "totalVersions": 12,
  "versions": ["2.1.0", "2.0.0", "1.9.0"],
  "downloads": 5400,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2025-11-20T14:00:00Z",
  "dependencies": ["react", "react-dom"],
  "readme": "# UI Kit\n\nA modern component library...",
  "distributionMode": "pool",
  "hasAccess": true,
  "installMethod": {
    "command": "lpm add",
    "description": "Extracts source files into your project for customization."
  },
  "accessInfo": {
    "model": "pool",
    "summary": "Included with Pool subscription ($12/mo)",
    "actionRequired": false
  }
}
```

### lpm_browse_source

Browse source code of an LPM package you have access to. Call without `path` to get the file tree, then request specific files or directories.

**Parameters:**

- `name` (string, required) — Package name in `owner.package-name` or `@lpm.dev/owner.package-name` format
- `version` (string, optional) — Specific version to browse (defaults to latest)
- `path` (string, optional) — File or directory path (e.g., `src/index.js` or `src`). Omit for tree only.

**Example response (tree only):**

```json
{
  "package": "alice.ui-kit",
  "version": "2.0.0",
  "ecosystem": "js",
  "tree": ["src/index.js", "src/button.jsx", "src/input.jsx", "package.json"]
}
```

**Example response (with path):**

```json
{
  "package": "alice.ui-kit",
  "version": "2.0.0",
  "ecosystem": "js",
  "tree": ["src/index.js", "src/button.jsx", "src/input.jsx", "package.json"],
  "files": [
    { "path": "src/button.jsx", "content": "export function Button() { ... }" }
  ]
}
```

### lpm_add

Add an LPM package to the project by extracting source files for customization. Use for UI components, blocks, templates, Swift packages, and MCP servers. Requires LPM CLI installed locally.

**Parameters:**

- `name` (string, required) — Package name
- `version` (string, optional) — Specific version (defaults to latest)
- `path` (string, optional) — Target directory (e.g., `src/components/ui`)
- `alias` (string, optional) — Import alias prefix (e.g., `@/components/ui`)
- `target` (string, optional) — Swift SPM target name
- `force` (boolean, optional) — Overwrite existing files
- `installDeps` (boolean, optional) — Auto-install npm deps (default: true)
- `config` (object, optional) — Config schema params (e.g., `{ "styling": "panda" }`)

**Example response:**

```json
{
  "success": true,
  "package": { "name": "@lpm.dev/alice.ui-kit", "version": "2.0.0" },
  "installPath": "src/components/ui",
  "files": [
    { "dest": "src/components/ui/button.jsx", "action": "created" },
    { "dest": "src/components/ui/input.jsx", "action": "created" }
  ],
  "dependencies": { "npm": ["react"], "lpm": [] }
}
```

### lpm_install

Install an LPM package as a dependency to node_modules (like npm install). Use for JS libraries, utilities, and SDKs. Requires LPM CLI installed locally.

**Parameters:**

- `name` (string, required) — Package name
- `version` (string, optional) — Specific version (defaults to latest)

**Example response:**

```json
{
  "success": true,
  "packages": [{ "name": "@lpm.dev/bob.validate" }],
  "npmOutput": "added 1 package in 1s"
}
```

### lpm_get_install_command

Get the correct CLI command to install an LPM package. Returns `lpm add` (source extraction) or `lpm install` (node_modules) based on the package type and ecosystem.

**Parameters:**

- `name` (string, required) — Package name
- `version` (string, optional) — Specific version

**Example response:**

```json
{
  "command": "lpm add @lpm.dev/alice.ui-kit",
  "method": "add",
  "explanation": "Extracts source files into your project for customization."
}
```

### lpm_quality_report

Get the quality score and detailed check breakdown for an LPM package. Covers 27 checks across documentation, code quality, testing, and maintenance health.

**Parameters:**

- `name` (string, required) — Package name in `owner.package-name` format

**Example response:**

```json
{
  "name": "@lpm.dev/alice.ui-kit",
  "score": 85,
  "maxScore": 100,
  "tier": "good",
  "categories": [
    { "name": "documentation", "score": 22, "maxScore": 25 },
    { "name": "code", "score": 28, "maxScore": 30 }
  ],
  "checks": [
    { "id": "has-readme", "passed": true, "points": 10, "maxPoints": 10 }
  ]
}
```

### lpm_search_owners

Search for users or organizations on the LPM registry by name or username.

**Parameters:**

- `query` (string, required) — Name or username to search for
- `limit` (number, optional) — Max results, 1-10 (default: 5)

**Example response:**

```
Found 2 profiles:

- @alice (Alice Smith) [user] — Full-stack developer
- @acme (Acme Corp) [org] — Open source tools for developers
```

### lpm_packages_by_owner

List packages published by a specific user or organization. Shows only public (pool/marketplace) packages.

**Parameters:**

- `owner` (string, required) — Username or organization slug
- `limit` (number, optional) — Max results, 1-50 (default: 10)

**Example response:**

```
Found 2 packages by alice:

- alice.ui-kit [pool] — A modern UI component kit for React (5,400 downloads)
- alice.form-validator [marketplace] — Form validation utilities (1,200 downloads)
```

### lpm_pool_stats

Get your Pool revenue sharing earnings estimate for the current month. Shows per-package breakdown with installs, weighted downloads, share percentage, and estimated earnings.

**Parameters:** None

**Example response:**

```json
{
  "billingPeriod": "2026-02",
  "totalWeightedDownloads": 5000,
  "estimatedEarningsCents": 2450,
  "packages": [
    {
      "name": "@lpm.dev/alice.my-utils",
      "installCount": 120,
      "weightedDownloads": 3200,
      "sharePercentage": 1.85,
      "estimatedEarningsCents": 1800
    }
  ]
}
```

### lpm_user_info

Get information about the authenticated LPM user including organizations, plan tier, pool access, and usage limits.

**Parameters:** None

**Example response:**

```json
{
  "username": "alice@example.com",
  "profile_username": "alice",
  "organizations": [{ "slug": "acme", "name": "Acme Corp", "role": "owner" }],
  "available_scopes": ["@alice", "@acme"],
  "plan_tier": "pro",
  "has_pool_access": true,
  "usage": { "storage_bytes": 50000000, "private_packages": 2 },
  "limits": { "privatePackages": 10, "storageBytes": 524288000 }
}
```

## Caching

Responses are cached in memory to reduce API calls:

| Tool                      | Cache TTL |
| ------------------------- | --------- |
| `lpm_search`              | 5 minutes |
| `lpm_package_info`        | 5 minutes |
| `lpm_browse_source`       | 5 minutes |
| `lpm_get_install_command` | 5 minutes |
| `lpm_quality_report`      | 5 minutes |
| `lpm_search_owners`       | 5 minutes |
| `lpm_packages_by_owner`   | 5 minutes |
| `lpm_pool_stats`          | 1 hour    |
| `lpm_user_info`           | 5 minutes |
| `lpm_add`                 | No cache  |
| `lpm_install`             | No cache  |

Cache is in-memory only and resets when the server restarts.

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
