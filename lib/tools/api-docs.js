import { registryGet } from "../api.js"
import { CACHE_TTL } from "../constants.js"
import { errorResponse, parseName, textResponse } from "../format.js"
import { resolveInstalledVersion } from "../resolve-version.js"

/**
 * Fetch the structured API documentation for an LPM package.
 * Returns functions, interfaces, classes, type aliases, enums, and variables
 * with signatures, params, return types, and descriptions.
 *
 * @param {{ name: string, version?: string }} params
 * @param {{ cache: import('../cache.js').MemoryCache, getToken: () => Promise<string|null>, getBaseUrl: () => string }} ctx
 */
export async function apiDocs({ name, version }, ctx) {
	let owner, pkgName
	try {
		const parsed = parseName(name)
		owner = parsed.owner
		pkgName = parsed.name
	} catch (err) {
		return errorResponse(err.message)
	}

	const token = await ctx.getToken()
	const queryName = `${owner}.${pkgName}`

	// Resolve version from local package.json if not specified
	const resolvedVersion =
		version || resolveInstalledVersion(queryName) || undefined
	const versionKey = resolvedVersion || "latest"
	const cacheKey = `api-docs:${queryName}:${versionKey}:auth=${!!token}`

	const cached = ctx.cache.get(cacheKey)
	if (cached) return cached

	const baseUrl = ctx.getBaseUrl()
	const params = new URLSearchParams({ name: queryName })
	if (resolvedVersion) params.set("version", resolvedVersion)

	const result = await registryGet(
		`/api-docs?${params.toString()}`,
		token,
		baseUrl,
	)

	if (!result.ok) {
		if (result.status === 404) {
			const label = resolvedVersion
				? `${queryName}@${resolvedVersion}`
				: queryName
			return errorResponse(`Package ${label} not found.`)
		}
		if (result.status === 403) {
			return errorResponse(
				"Access denied. Private packages require authentication from the package owner.",
			)
		}
		return errorResponse(
			result.data?.error || `Request failed (${result.status})`,
		)
	}

	const data = result.data

	// If docs aren't available yet, return a helpful message
	if (!data.available) {
		const response = textResponse(
			`API docs for ${data.name}@${data.version}: ${data.message}`,
		)
		// Cache unavailable status for a shorter time (1 min) so retries work
		ctx.cache.set(cacheKey, response, 60_000)
		return response
	}

	const response = textResponse(JSON.stringify(data, null, 2))
	ctx.cache.set(cacheKey, response, CACHE_TTL.SHORT)
	return response
}
