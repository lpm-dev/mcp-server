# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Fixed

- **Registry and docs responses are read within a size limit and timeouts.**
  - A body over 50 MB is cancelled, and the tool returns an error instead of parsing it.
  - A request may wait 30 seconds for headers and 30 seconds between chunks of its body, and take 2 minutes in all. A server that sends headers and then stalls no longer hangs the call, and a slow download that keeps arriving still finishes.
  - Documentation pages and the docs index use the same limits; they had no timeout before.
- **Error responses keep their status.** A 401, 403 or 404 whose body breaks off, stalls or is too large is still reported as that status, without a retry.
- **JSON bodies that start with a byte-order mark parse again**, as they did with `response.json()`.
- **A long `Retry-After` is not waited on.** When a server asks to wait longer than the backoff allows (10 seconds), the call returns rate limited instead of sleeping.
- **`lpm_docs` reports a failure when no matching page could be read**, instead of an empty answer.
- **`lpm_browse_source` lists at most 2,000 paths.**
  - A larger tree comes with `treeTotal`, `treeTruncated`, and a `treeSummary` counting paths by top-level entry, instead of passing up to 20,000 paths to the model.
  - With `path`, a tree too large to list shows the paths under that directory.
- **The session cache holds at most 500 entries**, dropping the least recently used.

## [0.3.0] - 2026-11-08

### Changed

- **Keychain lookup matches LPM CLI** — The token is read from the registry-scoped account LPM CLI writes, `auth-token:<16 hex>` from SHA-256 of the registry URL without trailing slashes, then from the account earlier CLI releases used for a login made with a trailing slash. `LPM_TOKEN` still comes first. The unscoped `auth-token` account is no longer read, so sign in again with a current LPM CLI if the server finds no token
- **Agent tools pass complete CLI reports through** — Reports keep every field the CLI returns, process failures come back with their output, and `lpm_audit` honors its project path
- **The CLI decides access** — Tools no longer refuse anonymous calls before the CLI applies its own access rules
- **Search takes filters alone** — `lpm_search` accepts the Free distribution and filter-only requests without a query
- The server reports its package version to MCP clients instead of a fixed one

### Fixed

- **Executable discovery** — Absolute paths outside the project are scanned, the Windows npm native package resolves without a shell, and relative overrides are refused, including Windows paths without a drive or UNC share
- A missing optional `keytar` module returns no token instead of failing, and keychain read errors give an actionable message without the token

## [0.2.0] - 2026-03-25

### Added

- **`lpm_audit`** — Run security audits on project dependencies. Returns behavioral tags, AI security findings, quality scores, and lifecycle scripts
- **`lpm_marketplace_info`** — Get marketplace pricing, licensing, seat management, and purchase status for paid packages
- **`lpm_docs`** — Search and read LPM documentation. AI can answer "how do I use LPM?" questions by fetching docs from `lpm.dev/api/docs`

### Changed

- **`lpm install` now handles both JS and Swift packages** — JS packages go to `node_modules`, Swift packages edit `Package.swift` via SE-0292. No more ecosystem-based routing to `lpm add`
- **`lpm add` is now source delivery only** — Always extracts files into the project. No `--source` or `--registry` flags
- **`lpm_browse_source` marked as last resort** — Description updated to guide AI toward installing locally first, then reading local files. Remote browsing only when the package can't be installed
- **`lpm_package_context` scoped to pre-install evaluation** — Description clarifies: use before installing, then switch to local files + `lpm_package_skills`
- **`lpm_package_skills` scoped to post-install building** — Description clarifies: use when generating code with an already-installed package
- Default install command changed from `lpm add` to `lpm install` for non-source packages

### Removed

- **`lpm_get_install_command`** — Redundant; `lpm_package_info` already returns `installMethod` with the correct command

## [0.1.1] - 2026-03-11

### Added

- **API docs, LLM context, and package context tools** — `lpm_api_docs`, `lpm_llm_context`, `lpm_package_context` for richer package information
- **Package skills tool** — `lpm_package_skills` for discovering Agent Skills in packages
- Ecosystem filtering in `lpm_search` (JavaScript, Swift, XCFramework)
- Package metadata support in `lpm_package_info`
- Comprehensive test coverage for response formatting, owner search, and all tools

### Changed

- Code style standardized to double quotes across all files (Biome enforced)
- Version now resolved from `package.json` instead of hardcoded

### Fixed

- Added `repository` field to `package.json`
- Excluded test files from published package

## [0.1.0] - 2026-02-15

### Added

- Initial MCP server release
- `lpm_search` with natural language processing and caching
- `lpm_package_info` for package details and version lookup
- `lpm_install` and `lpm_get_install_command` for package installation
- `lpm_packages_by_owner` for listing packages by owner
- `lpm_search_owners` for finding package authors
- `lpm_pool_stats` for Pool revenue statistics
- `lpm_quality_report` for package quality scores
- `lpm_browse_source` for viewing package source code
- `lpm_user_info` for user profile lookup
- `lpm_add` for source code delivery
