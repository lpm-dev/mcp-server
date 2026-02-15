import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getBaseUrl, getToken } from './auth.js'
import { MemoryCache } from './cache.js'
import { checkName } from './tools/check-name.js'
import { marketplaceEarnings } from './tools/marketplace-earnings.js'
import { marketplaceSearch } from './tools/marketplace-search.js'
import { packageInfo } from './tools/package-info.js'
import { poolStats } from './tools/pool-stats.js'
import { qualityReport } from './tools/quality-report.js'
import { search } from './tools/search.js'
import { userInfo } from './tools/user-info.js'

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
		'Get metadata for an LPM package including versions, description, downloads, and readme',
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
		'lpm_check_name',
		'Check if a package name is available on the LPM registry. Requires authentication.',
		{
			name: z.string().describe(
				'Package name to check in owner.package-name format',
			),
		},
		(params) => checkName(params, context),
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
			limit: z.number().min(1).max(50).optional().describe(
				'Maximum number of results (1-50, default 10)',
			),
		},
		(params) => marketplaceSearch(params, context),
	)

	server.tool(
		'lpm_marketplace_earnings',
		'Get your Marketplace revenue summary including total sales, gross revenue, platform fees, and net revenue. Requires authentication.',
		{},
		(params) => marketplaceEarnings(params, context),
	)

	server.tool(
		'lpm_user_info',
		'Get information about the authenticated LPM user including organizations, plan tier, pool access, and usage limits. Requires authentication.',
		{},
		(params) => userInfo(params, context),
	)

	server.tool(
		'lpm_search',
		'Search LPM packages using natural language. Uses hybrid keyword + semantic search to find packages by description, capabilities, or use case.',
		{
			query: z.string().describe(
				'Natural language search query (e.g., "validate user input", "react component library")',
			),
			limit: z.number().min(1).max(20).optional().describe(
				'Maximum number of results (1-20, default 10)',
			),
		},
		(params) => search(params, context),
	)

	return server
}
