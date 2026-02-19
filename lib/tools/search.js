import { searchGet } from '../api.js'
import { CACHE_TTL } from '../constants.js'
import { errorResponse, textResponse } from '../format.js'

/**
 * Search LPM packages using natural language (hybrid keyword + semantic search).
 *
 * @param {{ query: string, limit?: number }} params
 * @param {{ cache: import('../cache.js').MemoryCache, getToken: () => Promise<string|null>, getBaseUrl: () => string }} ctx
 */
export async function search({ query, limit }, ctx) {
	if (!query || query.trim().length < 2) {
		return errorResponse('Search query must be at least 2 characters.')
	}

	const q = query.trim()
	const safeLimit = Math.min(Math.max(limit || 10, 1), 20)

	const cacheKey = `search:${q}:${safeLimit}`
	const cached = ctx.cache.get(cacheKey)
	if (cached) return cached

	const token = await ctx.getToken()
	const baseUrl = ctx.getBaseUrl()
	const params = new URLSearchParams({
		q,
		mode: 'semantic',
		limit: String(safeLimit),
	})

	const result = await searchGet(`/packages?${params.toString()}`, token, baseUrl)

	if (!result.ok) {
		return errorResponse(result.data?.error || `Search failed (${result.status})`)
	}

	const packages = result.data?.packages || []

	if (packages.length === 0) {
		const response = textResponse(`No packages found for "${q}".`)
		ctx.cache.set(cacheKey, response, CACHE_TTL.SHORT)
		return response
	}

	const lines = [`Found ${packages.length} package${packages.length === 1 ? '' : 's'}:\n`]

	for (const pkg of packages) {
		const owner = pkg.orgSlug || pkg.username || pkg.owner
		const name = `${owner}.${pkg.name}`
		const desc = pkg.description ? ` — ${pkg.description}` : ''
		const downloads = pkg.downloadCount
			? ` (${Number(pkg.downloadCount).toLocaleString()} downloads)`
			: ''
		const typeLabel =
			pkg.packageType && pkg.packageType !== 'package'
				? ` [${pkg.packageType}]`
				: ''
		lines.push(`- ${name}${typeLabel}${desc}${downloads}`)
	}

	const response = textResponse(lines.join('\n'))
	ctx.cache.set(cacheKey, response, CACHE_TTL.SHORT)
	return response
}
