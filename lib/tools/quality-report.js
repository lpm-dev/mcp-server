import { registryGet } from "../api.js"
import { CACHE_TTL } from "../constants.js"
import { errorResponse, parseName, textResponse } from "../format.js"

/**
 * Fetch the quality report for an LPM package.
 *
 * @param {{ name: string }} params
 * @param {{ cache: import('../cache.js').MemoryCache, getToken: () => Promise<string|null>, getBaseUrl: () => string }} ctx
 */
export async function qualityReport({ name }, ctx) {
	let queryName
	try {
		const parsed = parseName(name)
		queryName = `${parsed.owner}.${parsed.name}`
	} catch (err) {
		return errorResponse(err.message)
	}

	const token = await ctx.getToken()
	const cacheKey = `quality:${queryName}:auth=${!!token}`

	const cached = ctx.cache.get(cacheKey)
	if (cached) return cached

	const baseUrl = ctx.getBaseUrl()
	const result = await registryGet(
		`/quality?name=${encodeURIComponent(queryName)}`,
		token,
		baseUrl,
	)

	if (!result.ok) {
		if (result.status === 404) {
			return errorResponse(`Package ${queryName} not found.`)
		}
		if (result.status === 403) {
			return errorResponse(
				"Access denied. Private packages require authentication.",
			)
		}
		return errorResponse(
			result.data?.error || `Request failed (${result.status})`,
		)
	}

	const response = textResponse(JSON.stringify(result.data, null, 2))
	ctx.cache.set(cacheKey, response, CACHE_TTL.SHORT)
	return response
}
