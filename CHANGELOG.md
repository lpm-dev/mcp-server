# Changelog

All notable changes to this project will be documented in this file.

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
