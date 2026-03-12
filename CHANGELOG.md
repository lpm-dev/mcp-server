# Changelog

All notable changes to this project will be documented in this file.

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
