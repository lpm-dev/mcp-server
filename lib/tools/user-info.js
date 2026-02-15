import { registryGet } from '../api.js'
import { CACHE_TTL, ERROR_MESSAGES } from '../constants.js'
import { errorResponse, textResponse } from '../format.js'

/**
 * Fetch info about the authenticated LPM user.
 * Requires authentication.
 *
 * @param {object} _params
 * @param {{ cache: import('../cache.js').MemoryCache, getToken: () => Promise<string|null>, getBaseUrl: () => string }} ctx
 */
export async function userInfo(_params, ctx) {
	const token = await ctx.getToken()
	if (!token) {
		return errorResponse(ERROR_MESSAGES.noToken)
	}

	const cacheKey = 'user-info'

	const cached = ctx.cache.get(cacheKey)
	if (cached) return cached

	const baseUrl = ctx.getBaseUrl()
	const result = await registryGet('/-/whoami', token, baseUrl)

	if (!result.ok) {
		if (result.status === 401) {
			return errorResponse(ERROR_MESSAGES.unauthorized)
		}
		return errorResponse(result.data?.error || `Request failed (${result.status})`)
	}

	const response = textResponse(JSON.stringify(result.data, null, 2))
	ctx.cache.set(cacheKey, response, CACHE_TTL.SHORT)
	return response
}
