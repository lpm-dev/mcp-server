# @lpm-registry/mcp-server

MCP (Model Context Protocol) server for the [LPM](https://lpm.dev) package registry. Gives AI tools like Claude Code, Cursor, and other MCP-compatible agents access to package info, quality reports, name checks, pool earnings, and marketplace search.

## Installation

```bash
npm install -g @lpm-registry/mcp-server
```

Or run directly:

```bash
npx @lpm-registry/mcp-server
```

## Configuration

### Authentication

Set the `LPM_TOKEN` environment variable with your LPM API token:

```bash
export LPM_TOKEN=lpm_your_token_here
```

If you've already logged in with the LPM CLI (`lpm login`), the MCP server will automatically read your token from the OS keychain.

### Registry URL

Defaults to `https://lpm.dev`. Override with:

```bash
export LPM_REGISTRY_URL=https://your-registry.dev
```

## MCP Client Setup

### Claude Code

Add to your Claude Code MCP settings (`.claude/settings.json` or global settings):

```json
{
  "mcpServers": {
    "lpm-registry": {
      "command": "npx",
      "args": ["@lpm-registry/mcp-server"],
      "env": {
        "LPM_TOKEN": "lpm_your_token_here"
      }
    }
  }
}
```

### Cursor

Add to your Cursor MCP configuration (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "lpm-registry": {
      "command": "npx",
      "args": ["@lpm-registry/mcp-server"],
      "env": {
        "LPM_TOKEN": "lpm_your_token_here"
      }
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "lpm-registry": {
      "command": "npx",
      "args": ["@lpm-registry/mcp-server"],
      "env": {
        "LPM_TOKEN": "lpm_your_token_here"
      }
    }
  }
}
```

## Available Tools

| Tool | Description | Auth Required |
|------|-------------|---------------|
| `lpm_package_info` | Get package metadata (versions, downloads, readme) | Optional |
| `lpm_quality_report` | Get quality score and 27-check breakdown | Optional |
| `lpm_check_name` | Check if a package name is available | Yes |
| `lpm_pool_stats` | Get your Pool revenue earnings for the current month | Yes |
| `lpm_marketplace_earnings` | Get your Marketplace revenue summary | Yes |
| `lpm_marketplace_search` | Search marketplace by category or keyword | No |
| `lpm_user_info` | Get authenticated user info, orgs, and usage | Yes |

## Tool Details

### lpm_package_info

Get metadata for an LPM package including versions, description, downloads, and readme.

**Parameters:**
- `name` (string, required) — Package name in `owner.package-name` or `@lpm.dev/owner.package-name` format

**Example response:**
```json
{
  "name": "@lpm.dev/alice.ui-kit",
  "description": "A modern UI component kit for React",
  "latestVersion": "2.1.0",
  "totalVersions": 12,
  "versions": ["2.1.0", "2.0.0", "1.9.0"],
  "downloads": 5400,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2025-11-20T14:00:00Z",
  "dependencies": ["react", "react-dom"],
  "readme": "# UI Kit\n\nA modern component library..."
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

### lpm_check_name

Check if a package name is available on the LPM registry. Requires authentication to prevent anonymous enumeration.

**Parameters:**
- `name` (string, required) — Package name to check in `owner.package-name` format

**Example response:**
```json
{
  "name": "@lpm.dev/alice.new-package",
  "available": true,
  "ownerExists": true,
  "ownerType": "user"
}
```

### lpm_pool_stats

Get your Pool revenue sharing earnings estimate for the current month. Shows per-package breakdown with installs, weighted downloads, share percentage, and estimated earnings.

**Parameters:** None

**Example response:**
```json
{
  "billingPeriod": "2026-02",
  "authorPoolCents": 144000,
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

### lpm_marketplace_earnings

Get your Marketplace revenue summary including total sales, gross revenue, platform fees, and net revenue.

**Parameters:** None

**Example response:**
```json
{
  "totalSales": 12,
  "grossRevenueCents": 15000,
  "platformFeesCents": 1500,
  "netRevenueCents": 13500
}
```

### lpm_marketplace_search

Search the LPM marketplace for packages by category or keyword. Returns pricing, quality scores, and download counts for comparable packages.

**Parameters:**
- `query` (string, optional) — Search keyword
- `category` (string, optional) — Category filter (e.g., `ui-components`)
- `limit` (number, optional) — Max results, 1-50 (default: 10)

At least one of `query` or `category` is required.

**Example response:**
```json
{
  "comparables": [
    {
      "name": "@lpm.dev/acme.ui-buttons",
      "description": "Beautiful button components",
      "downloadCount": 5400,
      "qualityScore": 88,
      "distributionMode": "marketplace",
      "pricing": {
        "planCount": 2,
        "minPriceCents": 999,
        "maxPriceCents": 2999
      }
    }
  ],
  "stats": {
    "total": 15,
    "priceRange": { "minCents": 499, "maxCents": 9999, "medianCents": 1999 }
  }
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
  "organizations": [
    { "slug": "acme", "name": "Acme Corp", "role": "owner" }
  ],
  "available_scopes": ["@alice", "@acme"],
  "plan_tier": "pro",
  "has_pool_access": true,
  "usage": { "storage_bytes": 50000000, "private_packages": 2 },
  "limits": { "privatePackages": 10, "storageBytes": 524288000 }
}
```

## Caching

Responses are cached in memory to reduce API calls:

| Tool | Cache TTL |
|------|-----------|
| `lpm_package_info` | 5 minutes |
| `lpm_quality_report` | 5 minutes |
| `lpm_check_name` | No cache (real-time) |
| `lpm_pool_stats` | 1 hour |
| `lpm_marketplace_earnings` | 1 hour |
| `lpm_marketplace_search` | 1 hour |
| `lpm_user_info` | 5 minutes |

Cache is in-memory only and resets when the server restarts.

## Troubleshooting

**"No LPM token found"**
Set the `LPM_TOKEN` environment variable in your MCP client configuration, or run `lpm login` first.

**"Authentication failed"**
Your token may be expired or revoked. Generate a new token at https://lpm.dev/dashboard/tokens or run `lpm login`.

**"Cannot reach lpm.dev"**
Check your internet connection. If you're behind a proxy, ensure it allows HTTPS connections to lpm.dev.

**"Package not found"**
Verify the package name format: `owner.package-name` (e.g., `alice.ui-kit`).
