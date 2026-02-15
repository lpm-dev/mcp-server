import { registryGet } from '../api.js'
import { CACHE_TTL, ERROR_MESSAGES } from '../constants.js'
import { errorResponse, textResponse } from '../format.js'

/**
 * Search the LPM marketplace for comparable packages.
 *
 * @param {{ query?: string, category?: string, limit?: number }} params
 * @param {{ cache: import('../cache.js').MemoryCache, getToken: () => Promise<string|null>, getBaseUrl: () => string }} ctx
 */
export async function marketplaceSearch({ query, category, limit }, ctx) {
	if (!query && !category) {
		return errorResponse(ERROR_MESSAGES.marketplaceNoParams)
	}

	const searchParams = new URLSearchParams()
	if (category) searchParams.set('category', category)
	if (query) searchParams.set('q', query)
	if (limit) searchParams.set('limit', String(limit))

	const cacheKey = `marketplace:${query || ''}:${category || ''}:${limit || 10}`

	const cached = ctx.cache.get(cacheKey)
	if (cached) return cached

	const token = await ctx.getToken()
	const baseUrl = ctx.getBaseUrl()
	const result = await registryGet(
		`/marketplace/comparables?${searchParams.toString()}`,
		token,
		baseUrl,
	)

	if (!result.ok) {
		return errorResponse(result.data?.error || `Request failed (${result.status})`)
	}

	const response = textResponse(JSON.stringify(result.data, null, 2))
	ctx.cache.set(cacheKey, response, CACHE_TTL.LONG)
	return response
}
