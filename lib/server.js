import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getBaseUrl, getToken } from './auth.js'
import { MemoryCache } from './cache.js'
import { marketplaceSearch } from './tools/marketplace-search.js'
import { packagesByOwner } from './tools/packages-by-owner.js'
import { packageInfo } from './tools/package-info.js'
import { poolStats } from './tools/pool-stats.js'
import { qualityReport } from './tools/quality-report.js'
import { search } from './tools/search.js'
import { searchOwners } from './tools/search-owners.js'
import { userInfo } from './tools/user-info.js'
import { getInstallCommand } from './tools/get-install-command.js'
import { add } from './tools/add.js'
import { browseSource } from './tools/browse-source.js'
import { install } from './tools/install.js'

/**
 * Create and configure the MCP server with all LPM tools.
 * @returns {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer}
 */
export function createServer() {
	const server = new McpServer({
		name: 'lpm-registry',
		version: '0.1.0',
	})

	const cache = new MemoryCache()
	const context = { cache, getToken, getBaseUrl }

	server.tool(
		'lpm_package_info',
		'Get metadata for an LPM package including versions, description, downloads, AI analysis, compatibility, and readme',
		{
			name: z.string().describe(
				'Package name in owner.package-name or @lpm.dev/owner.package-name format',
			),
		},
		(params) => packageInfo(params, context),
	)

	server.tool(
		'lpm_quality_report',
		'Get the quality score and detailed check breakdown for an LPM package (27 checks across documentation, code, testing, health)',
		{
			name: z.string().describe(
				'Package name in owner.package-name format',
			),
		},
		(params) => qualityReport(params, context),
	)

	server.tool(
		'lpm_pool_stats',
		'Get your Pool revenue sharing earnings estimate for the current month. Shows per-package breakdown with installs, share %, and estimated earnings. Requires authentication.',
		{},
		(params) => poolStats(params, context),
	)

	server.tool(
		'lpm_marketplace_search',
		'Search the LPM marketplace for packages by category or keyword. Returns pricing, quality scores, and download counts for comparable packages.',
		{
			query: z.string().optional().describe(
				'Search keyword to find packages by name or description',
			),
			category: z.string().optional().describe(
				'Package category to filter by (e.g., ui-components, tools)',
			),
			ecosystem: z.enum(['js', 'swift', 'xcframework']).optional().describe(
				'Filter by package ecosystem (e.g., "swift" for iOS/macOS packages)',
			),
			limit: z.number().min(1).max(50).optional().describe(
				'Maximum number of results (1-50, default 10)',
			),
		},
		(params) => marketplaceSearch(params, context),
	)

	server.tool(
		'lpm_search_owners',
		'Search for users or organizations on the LPM registry by name or username.',
		{
			query: z.string().describe(
				'Name or username to search for',
			),
			limit: z.number().min(1).max(10).optional().describe(
				'Maximum number of results (1-10, default 5)',
			),
		},
		(params) => searchOwners(params, context),
	)

	server.tool(
		'lpm_packages_by_owner',
		'List packages published by a specific user or organization on the LPM registry. Shows public packages with distribution mode.',
		{
			owner: z.string().describe(
				'Username or organization slug to list packages for',
			),
			limit: z.number().min(1).max(50).optional().describe(
				'Maximum number of results (1-50, default 10)',
			),
		},
		(params) => packagesByOwner(params, context),
	)

	server.tool(
		'lpm_user_info',
		'Get information about the authenticated LPM user including organizations, plan tier, pool access, and usage limits. Requires authentication.',
		{},
		(params) => userInfo(params, context),
	)

	server.tool(
		'lpm_get_install_command',
		'Get the correct CLI command to install an LPM package. Returns either `lpm add` (extracts source files for customization — components, blocks, Swift packages) or `lpm install` (installs to node_modules as a dependency — libraries, utilities).',
		{
			name: z.string().describe(
				'Package name in owner.package-name or @lpm.dev/owner.package-name format',
			),
			version: z.string().optional().describe(
				'Specific version to install (defaults to latest)',
			),
		},
		(params) => getInstallCommand(params, context),
	)

	server.tool(
		'lpm_add',
		'Add an LPM package to the project by extracting source files for customization. Use for UI components, blocks, templates, Swift packages, and MCP servers. Requires LPM CLI installed.',
		{
			name: z.string().describe(
				'Package name in owner.package-name or @lpm.dev/owner.package-name format',
			),
			version: z.string().optional().describe(
				'Specific version to install (defaults to latest)',
			),
			path: z.string().optional().describe(
				'Target directory for installation (e.g., src/components/ui)',
			),
			alias: z.string().optional().describe(
				'Import alias prefix for rewriting (e.g., @/components/ui)',
			),
			target: z.string().optional().describe(
				'Swift SPM target name (for Swift packages)',
			),
			force: z.boolean().optional().describe(
				'Overwrite existing files without prompting',
			),
			installDeps: z.boolean().optional().describe(
				'Auto-install npm dependencies (default: true, set false to skip)',
			),
			config: z.record(z.string()).optional().describe(
				'Config schema params as key-value pairs (e.g., { "styling": "panda" })',
			),
		},
		(params) => add(params, context),
	)

	server.tool(
		'lpm_install',
		'Install an LPM package as a dependency to node_modules (like npm install). Use for JS libraries, utilities, and SDKs. Requires LPM CLI installed.',
		{
			name: z.string().describe(
				'Package name in owner.package-name or @lpm.dev/owner.package-name format',
			),
			version: z.string().optional().describe(
				'Specific version to install (defaults to latest)',
			),
		},
		(params) => install(params, context),
	)

	server.tool(
		'lpm_browse_source',
		'Browse source code of an LPM package you have access to. Use without `path` to see the file tree first, then request specific files or directories with `path`. Requires authentication. Pool packages require Pool subscription, marketplace packages require a license.',
		{
			name: z.string().describe(
				'Package name in owner.package-name or @lpm.dev/owner.package-name format',
			),
			version: z.string().optional().describe(
				'Specific version to browse (defaults to latest)',
			),
			path: z.string().optional().describe(
				'File or directory path to browse (e.g., "src/index.js" or "src"). Omit to get file tree only.',
			),
		},
		(params) => browseSource(params, context),
	)

	server.tool(
		'lpm_search',
		'Search LPM packages using natural language. Uses hybrid keyword + semantic search to find packages by description, capabilities, or use case.',
		{
			query: z.string().describe(
				'Natural language search query (e.g., "validate user input", "react component library")',
			),
			ecosystem: z.enum(['js', 'swift', 'xcframework']).optional().describe(
				'Filter by package ecosystem (e.g., "swift" for iOS/macOS packages)',
			),
			limit: z.number().min(1).max(20).optional().describe(
				'Maximum number of results (1-20, default 10)',
			),
		},
		(params) => search(params, context),
	)

	return server
}
