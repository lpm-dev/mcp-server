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
| `lpm_api_docs`            | Get structured API docs — functions, classes, types, signatures | Optional      |
| `lpm_llm_context`         | Get LLM-optimized usage guide — quickStart, patterns, gotchas   | Optional      |
| `lpm_package_context`     | Get complete package context in one call (pre-install evaluation) | Optional    |
| `lpm_package_skills`      | Get Agent Skills for building with an installed package         | Optional      |
| `lpm_docs`                | Search or read LPM documentation (setup, CLI, publishing, etc.) | No           |
| `lpm_browse_source`       | Browse package source code remotely (last resort)               | Yes           |
| `lpm_add`                 | Add a package by extracting source files into the project       | Yes           |
| `lpm_install`             | Install a managed dependency (JS → node_modules, Swift → Package.swift) | Yes  |
| `lpm_audit`               | Security audit — behavioral tags, AI findings, quality scores   | Yes           |
| `lpm_marketplace_info`    | Marketplace pricing, licensing, and seat management             | Optional      |
| `lpm_quality_report`      | Get quality score and 28-check breakdown                        | Optional      |
| `lpm_search_owners`       | Search for users or organizations by name                       | No            |
| `lpm_packages_by_owner`   | List packages published by a specific user or org               | No            |
| `lpm_pool_stats`          | Get your Pool revenue earnings for the current month            | Yes           |
| `lpm_user_info`           | Get authenticated user info, orgs, and usage                    | Yes           |

## AI Workflow

A typical AI agent workflow for finding and adding a package:

1. **Search** — `lpm_search` to find packages matching the need
2. **Evaluate** — `lpm_package_context` to understand the package before installing (metadata, API docs, usage guide)
3. **Install** — `lpm_install` for managed dependencies (JS + Swift) or `lpm_add` for source components
4. **Build** — `lpm_package_skills` for usage patterns, then read local files directly

The `lpm_package_context` response includes `package.installMethod.command` (`lpm add` or `lpm install`) so agents know which tool to use.

> **Tip:** After installing, prefer reading local files over `lpm_browse_source`. Local reads are faster and don't hit the server. Use `lpm_browse_source` only when evaluating a package you can't install (e.g., checking before purchase).

> **Version resolution:** Version-sensitive tools (`lpm_api_docs`, `lpm_llm_context`, `lpm_package_context`, `lpm_package_skills`, `lpm_browse_source`) resolve the version from the local project's package.json dependencies when no explicit version is specified. This ensures you get docs matching the version you actually have installed.

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

### lpm_api_docs

Get structured API documentation for an LPM package. Returns functions, classes, interfaces, type aliases, enums, and variables with full signatures, parameter types, return types, and descriptions. Use this to understand how to use a package before installing it.

API docs are auto-generated during publish from TypeScript definitions, AI analysis, or JSDoc annotations.

**Parameters:**

- `name` (string, required) — Package name in `owner.package-name` or `@lpm.dev/owner.package-name` format
- `version` (string, optional) — Specific version to get docs for (defaults to latest)

**Example response:**

```json
{
  "name": "@lpm.dev/alice.ui-kit",
  "version": "2.1.0",
  "available": true,
  "docsStatus": "extracted",
  "apiDocs": {
    "version": 1,
    "strategy": "typescript",
    "entryPoint": "dist/index.d.ts",
    "modules": [
      {
        "path": "index",
        "functions": [
          {
            "name": "createTheme",
            "description": "Create a custom theme configuration",
            "signatures": [
              {
                "params": [
                  { "name": "options", "type": "ThemeOptions", "optional": true }
                ],
                "returnType": "Theme",
                "typeParams": []
              }
            ]
          }
        ],
        "interfaces": [
          {
            "name": "ThemeOptions",
            "description": "Configuration for theme creation",
            "properties": [
              { "name": "colors", "type": "ColorPalette", "optional": true },
              { "name": "spacing", "type": "SpacingScale", "optional": true }
            ]
          }
        ],
        "classes": [],
        "typeAliases": [],
        "enums": [],
        "variables": []
      }
    ],
    "stats": {
      "functionCount": 5,
      "classCount": 2,
      "interfaceCount": 8,
      "totalExports": 18
    }
  }
}
```

**When docs aren't available:**

```json
{
  "name": "@lpm.dev/bob.utils",
  "version": "1.0.0",
  "available": false,
  "docsStatus": "pending",
  "message": "API docs are being generated. Try again in a few minutes."
}
```

### lpm_llm_context

Get an LLM-optimized usage guide for an LPM package. Returns a concise cheat sheet with purpose, quickStart code, key exports with signatures, common usage patterns, gotchas, and guidance on when to use the package. Use this to quickly understand how to write correct code with a package.

LLM context is auto-generated during publish using AI analysis of the package's API docs, source code, and readme.

**Parameters:**

- `name` (string, required) — Package name in `owner.package-name` or `@lpm.dev/owner.package-name` format
- `version` (string, optional) — Specific version to get context for (defaults to latest)

**Example response:**

```json
{
  "name": "@lpm.dev/alice.ui-kit",
  "version": "2.1.0",
  "available": true,
  "llmContextStatus": "extracted",
  "llmContext": {
    "version": 1,
    "purpose": "React UI component library with theme support and accessibility built-in",
    "quickStart": "import { Button, Input } from '@lpm.dev/alice.ui-kit'\n\n<Button variant=\"primary\">Click me</Button>",
    "keyExports": [
      {
        "name": "Button",
        "kind": "component",
        "signature": "(props: ButtonProps) => JSX.Element",
        "description": "Primary button component with variants and loading state"
      },
      {
        "name": "createTheme",
        "kind": "function",
        "signature": "(options?: ThemeOptions) => Theme",
        "description": "Create a custom theme configuration"
      }
    ],
    "commonPatterns": [
      {
        "title": "Basic button with loading state",
        "code": "<Button isLoading={isPending} onClick={handleSubmit}>Save</Button>",
        "description": "Use isLoading prop to show spinner during async operations"
      }
    ],
    "gotchas": [
      "Requires React 18+ as peer dependency",
      "Theme must be wrapped in ThemeProvider at app root"
    ],
    "whenToUse": "Building React apps that need consistent, accessible UI components with theme support",
    "whenNotToUse": "Server-rendered pages without React, or when you need only a single component"
  }
}
```

**When context isn't available:**

```json
{
  "name": "@lpm.dev/bob.utils",
  "version": "1.0.0",
  "available": false,
  "llmContextStatus": "pending",
  "message": "LLM context is being generated. Try again in a few minutes."
}
```

### lpm_package_context

Get complete context for an LPM package in a single call. Combines condensed package metadata, structured API documentation, LLM-optimized usage guide, and Agent Skills. This is the recommended tool when you need to understand a package before using it.

Internally makes 4 parallel API calls. If API docs or LLM context aren't available yet (still being generated), they are omitted from the response. Only fails if the package itself is not found or inaccessible.

**Parameters:**

- `name` (string, required) — Package name in `owner.package-name` or `@lpm.dev/owner.package-name` format
- `version` (string, optional) — Specific version to get context for (defaults to latest)

**Example response (all available):**

```json
{
  "package": {
    "name": "@lpm.dev/alice.ui-kit",
    "description": "A modern UI component kit for React",
    "ecosystem": "js",
    "latestVersion": "2.1.0",
    "license": "MIT",
    "dependencies": ["react", "react-dom"],
    "peerDependencies": [],
    "installMethod": {
      "command": "lpm add",
      "description": "Extracts source files into your project for customization"
    },
    "distributionMode": "pool",
    "readme": "# UI Kit\n\nA modern component library for building..."
  },
  "apiDocs": {
    "version": 1,
    "strategy": "typescript",
    "modules": [
      {
        "path": "index",
        "functions": [{ "name": "createTheme", "description": "Create a custom theme" }]
      }
    ]
  },
  "llmContext": {
    "version": 1,
    "purpose": "React UI component library with theme support",
    "quickStart": "import { Button } from '@lpm.dev/alice.ui-kit'",
    "keyExports": [{ "name": "Button", "kind": "component" }],
    "commonPatterns": [],
    "gotchas": ["Requires React 18+"],
    "whenToUse": "Building React apps with consistent UI"
  }
}
```

When API docs, LLM context, or skills aren't available, those keys are simply omitted. Only the `package` key is always present. The readme is truncated to ~500 characters — use `lpm_package_info` for the full readme.

### lpm_package_skills

Fetch Agent Skills for an LPM package. Returns approved skills with their name, description, applicable file globs, and content. Skills are markdown files that provide workflow-specific instructions for AI coding assistants.

**Parameters:**

- `name` (string, required) — Package name in `owner.package-name` or `@lpm.dev/owner.package-name` format
- `version` (string, optional) — Specific version to get skills for (defaults to latest)

**Example response:**

```json
{
  "name": "@lpm.dev/alice.ui-kit",
  "version": "2.1.0",
  "skills": [
    {
      "name": "theming",
      "description": "How to create and apply custom themes",
      "globs": ["**/*.theme.*", "**/*.styles.*"],
      "content": "# Theming\n\nWhen creating a custom theme..."
    }
  ]
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

Add an LPM package to the project by extracting source files for customization. Use for UI components, blocks, templates, and MCP servers. Requires LPM CLI installed locally.

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

Install an LPM package as a managed dependency. JS packages go to node_modules, Swift packages edit Package.swift via SE-0292. Requires LPM CLI installed locally.

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

### lpm_audit

Run a security audit on the project's LPM dependencies. Returns behavioral tags (eval, childProcess, shell), AI security findings, quality scores, and lifecycle scripts.

**Parameters:**

- `path` (string, optional) — Project directory to audit (defaults to current directory)

**Example response:**

```json
{
  "success": true,
  "totalPackages": 3,
  "packagesWithIssues": 1,
  "packages": [
    {
      "name": "@lpm.dev/alice.ui-kit",
      "version": "2.0.0",
      "qualityScore": 85,
      "issues": []
    },
    {
      "name": "@lpm.dev/bob.exec-tool",
      "version": "1.0.0",
      "qualityScore": 45,
      "issues": ["uses child_process", "[moderate] Executes shell commands with user input"]
    }
  ]
}
```

### lpm_marketplace_info

Get marketplace information for an LPM package — pricing, licensing, seat management, and purchase status.

**Parameters:**

- `name` (string, required) — Package name

**Example response:**

```json
{
  "name": "@lpm.dev/acme.pro-suite",
  "isMarketplace": true,
  "distributionMode": "marketplace",
  "pricing": { "monthlyPriceCents": 2900, "yearlyPriceCents": 29000 },
  "licenseType": "per-seat",
  "accessInfo": { "hasLicense": true, "seatsUsed": 3, "seatsTotal": 5 }
}
```

### lpm_docs

Search or read LPM documentation. Use when the user asks how to use LPM itself.

**Parameters:**

- `page` (string, optional) — Doc page slug (e.g., `cli/commands`, `packages/swift-registry`)
- `query` (string, optional) — Search query (e.g., `npmrc`, `CI deployment`)

Without parameters: returns the full docs index.

### lpm_quality_report

Get the quality score and detailed check breakdown for an LPM package. Covers 28 checks across documentation, code quality, testing, and maintenance health.

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
| `lpm_api_docs`            | 5 minutes |
| `lpm_llm_context`         | 5 minutes |
| `lpm_package_context`     | 5 minutes |
| `lpm_package_skills`      | 5 minutes |
| `lpm_browse_source`       | 5 minutes |
| `lpm_marketplace_info`    | 5 minutes |
| `lpm_docs`                | 30 minutes |
| `lpm_quality_report`      | 5 minutes |
| `lpm_search_owners`       | 5 minutes |
| `lpm_packages_by_owner`   | 5 minutes |
| `lpm_pool_stats`          | 1 hour    |
| `lpm_user_info`           | 5 minutes |
| `lpm_audit`               | No cache  |
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
