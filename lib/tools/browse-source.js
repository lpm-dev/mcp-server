import { registryGet } from '../api.js'
import { CACHE_TTL } from '../constants.js'
import { errorResponse, parseName, textResponse } from '../format.js'

/**
 * Browse source code of an LPM package.
 *
 * Calls the registry source browsing API endpoint:
 *   GET /api/registry/@lpm.dev/{owner}.{name}/source?version=...&path=...
 *
 * - Without `path`: returns file tree only (use this first to explore structure)
 * - With `path`: returns file tree + source contents for matching files/directory
 *
 * @param {{ name: string, version?: string, path?: string }} params
 * @param {{ cache: import('../cache.js').MemoryCache, getToken: () => Promise<string|null>, getBaseUrl: () => string }} ctx
 */
export async function browseSource({ name, version, path }, ctx) {
	let owner, pkgName
	try {
		const parsed = parseName(name)
		owner = parsed.owner
		pkgName = parsed.name
	} catch (err) {
		return errorResponse(err.message)
	}

	const token = await ctx.getToken()
	if (!token) {
		return errorResponse('Authentication required to browse source code. Set LPM_TOKEN environment variable.')
	}

	// Build cache key (includes path for content requests)
	const cacheKey = `browse-source:${owner}.${pkgName}:${version || 'latest'}:${path || ''}`
	const cached = ctx.cache.get(cacheKey)
	if (cached) return cached

	// Build query string
	// path can be "" (all files), a specific path, or undefined (tree only)
	const params = new URLSearchParams()
	if (version) params.set('version', version)
	if (path != null) params.set('path', path)
	const qs = params.toString()

	const baseUrl = ctx.getBaseUrl()
	const url = `/@lpm.dev/${owner}.${pkgName}/source${qs ? `?${qs}` : ''}`
	const result = await registryGet(url, token, baseUrl)

	if (!result.ok) {
		if (result.status === 404) {
			const versionLabel = version || 'latest'
			return errorResponse(`Version ${versionLabel} not found for @lpm.dev/${owner}.${pkgName}.`)
		}
		if (result.status === 401) {
			return errorResponse('Authentication failed. Your token may be expired. Run `lpm login` to re-authenticate.')
		}
		if (result.status === 403) {
			return errorResponse(result.data?.error || 'Access denied. You may need a Pool subscription or license to browse this package.')
		}
		if (result.status === 429) {
			return errorResponse('Rate limit exceeded. Wait a minute and try again.')
		}
		if (result.status === 503) {
			return errorResponse('Source browsing is currently disabled.')
		}
		return errorResponse(result.data?.error || `Request failed (${result.status})`)
	}

	const data = result.data

	// Format response
	const response = {
		package: data.package,
		version: data.version,
		ecosystem: data.ecosystem,
	}

	// Always include tree
	response.tree = data.tree || []

	// Include files if present (only when path was requested)
	if (data.files && data.files.length > 0) {
		response.files = data.files
	}

	// Include truncation warning
	if (data.truncated) {
		response.truncated = true
		response.warning = 'Response was truncated due to size limits. Use the `path` parameter to request specific files or directories.'
	}

	// Include package config if present (helps AI understand package structure)
	if (data.lpmConfig) {
		response.lpmConfig = data.lpmConfig
	}

	const mcpResponse = textResponse(JSON.stringify(response, null, 2))
	ctx.cache.set(cacheKey, mcpResponse, CACHE_TTL.SHORT)
	return mcpResponse
}
