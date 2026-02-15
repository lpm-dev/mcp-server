import { registryGet } from '../api.js'
import { ERROR_MESSAGES } from '../constants.js'
import { errorResponse, parseName, textResponse } from '../format.js'

/**
 * Check if a package name is available on the LPM registry.
 * Requires authentication.
 *
 * @param {{ name: string }} params
 * @param {{ cache: import('../cache.js').MemoryCache, getToken: () => Promise<string|null>, getBaseUrl: () => string }} ctx
 */
export async function checkName({ name }, ctx) {
	let queryName
	try {
		const parsed = parseName(name)
		queryName = `${parsed.owner}.${parsed.name}`
	} catch (err) {
		return errorResponse(err.message)
	}

	const token = await ctx.getToken()
	if (!token) {
		return errorResponse(ERROR_MESSAGES.noToken)
	}

	const baseUrl = ctx.getBaseUrl()
	const result = await registryGet(
		`/check-name?name=${encodeURIComponent(queryName)}`,
		token,
		baseUrl,
	)

	if (!result.ok) {
		if (result.status === 401) {
			return errorResponse(ERROR_MESSAGES.unauthorized)
		}
		return errorResponse(result.data?.error || `Request failed (${result.status})`)
	}

	// No caching — name availability must be real-time
	return textResponse(JSON.stringify(result.data, null, 2))
}
