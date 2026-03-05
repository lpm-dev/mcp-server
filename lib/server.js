import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getBaseUrl, getToken } from './auth.js'
import { MemoryCache } from './cache.js'
import { packagesByOwner } from './tools/packages-by-owner.js'
import { packageInfo } from './tools/package-info.js'
import { poolStats } from './tools/pool-stats.js'
import { qualityReport } from './tools/quality-report.js'
import { search } from './tools/search.js'
import { searchOwners } from './tools/search-owners.js'
import { userInfo } from './tools/user-info.js'
import { getInstallCommand } from './tools/get-install-command.js'
import { add } from './tools/add.js'
import { apiDocs } from './tools/api-docs.js'
import { llmContext } from './tools/llm-context.js'
import { packageContext } from './tools/package-context.js'
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
		'lpm_api_docs',
		'Get structured API documentation for an LPM package — functions, classes, interfaces, type aliases, enums, and variables with signatures, params, return types, and descriptions. Use this to understand how to use a package before installing it.',
		{
			name: z.string().describe(
				'Package name in owner.package-name or @lpm.dev/owner.package-name format',
			),
			version: z.string().optional().describe(
				'Specific version to get docs for (defaults to latest)',
			),
		},
		(params) => apiDocs(params, context),
	)

	server.tool(
		'lpm_llm_context',
		'Get an LLM-optimized usage guide for an LPM package — purpose, quickStart code, key exports with signatures, common usage patterns, gotchas, and when to use it. Use this to quickly understand how to use a package correctly.',
		{
			name: z.string().describe(
				'Package name in owner.package-name or @lpm.dev/owner.package-name format',
			),
			version: z.string().optional().describe(
				'Specific version to get context for (defaults to latest)',
			),
		},
		(params) => llmContext(params, context),
	)

	server.tool(
		'lpm_package_context',
		'Get complete context for an LPM package in a single call — combines condensed package metadata (name, version, description, install method, dependencies), structured API docs (functions, classes, types), and LLM usage guide (quickStart, patterns, gotchas). Use this as the primary tool when you need to understand and use a package.',
		{
			name: z.string().describe(
				'Package name in owner.package-name or @lpm.dev/owner.package-name format',
			),
			version: z.string().optional().describe(
				'Specific version to get context for (defaults to latest)',
			),
		},
		(params) => packageContext(params, context),
	)

	server.tool(
		'lpm_pool_stats',
		'Get your Pool revenue sharing earnings estimate for the current month. Shows per-package breakdown with installs, share %, and estimated earnings. Requires authentication.',
		{},
		(params) => poolStats(params, context),
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
		`Browse source code of an LPM package you have access to. Use without \`path\` to see the file tree first, then request specific files or directories with \`path\`. Requires authentication. Pool packages require Pool subscription, marketplace packages require a license.

IMPORTANT: Prefer fetching directory paths (e.g., "src", "components") to get all files under that directory in a single request, rather than requesting individual files one by one. To get ALL source files at once, pass an empty string "" as path.`,
		{
			name: z.string().describe(
				'Package name in owner.package-name or @lpm.dev/owner.package-name format',
			),
			version: z.string().optional().describe(
				'Specific version to browse (defaults to latest)',
			),
			path: z.string().optional().describe(
				'File or directory path to browse (e.g., "src/index.js" or "src"). Omit to get file tree only. Pass empty string "" to get ALL source files at once.',
			),
		},
		(params) => browseSource(params, context),
	)

	server.tool(
		'lpm_search',
		'Search LPM packages using natural language or structured filters. Uses hybrid semantic search for natural language queries. Supports filtering by category, distribution mode, package type, ecosystem, license, and more.',
		{
			query: z.string().optional().describe(
				'Natural language search query (e.g., "validate user input", "react component library")',
			),
			category: z.string().optional().describe(
				'Package category to filter by (e.g., ui-components, tools)',
			),
			ecosystem: z.enum(['js', 'swift', 'xcframework']).optional().describe(
				'Filter by package ecosystem (e.g., "swift" for iOS/macOS packages)',
			),
			distribution: z.enum(['marketplace', 'pool', 'private']).optional().describe(
				'Filter by distribution mode',
			),
			packageType: z.enum([
				'package', 'source', 'mcp-server', 'vscode-extension',
				'cursor-rules', 'github-action', 'xcframework', 'other',
			]).optional().describe(
				'Filter by package type',
			),
			sort: z.enum(['newest', 'popular', 'name']).optional().describe(
				'Sort order (default: relevance for search, newest for filtered)',
			),
			hasTypes: z.boolean().optional().describe(
				'Filter to packages with TypeScript type definitions',
			),
			moduleType: z.enum(['esm', 'cjs', 'dual']).optional().describe(
				'Filter by JavaScript module type',
			),
			license: z.enum(['MIT', 'Apache-2.0', 'ISC', 'GPL-3.0', 'BSD-3-Clause', 'Unlicense']).optional().describe(
				'Filter by license',
			),
			minNodeVersion: z.enum(['18', '20', '22']).optional().describe(
				'Filter to packages supporting this Node.js version or lower',
			),
			limit: z.number().min(1).max(50).optional().describe(
				'Maximum number of results (1-50, default 10)',
			),
		},
		(params) => search(params, context),
	)

	return server
}
