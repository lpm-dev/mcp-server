import { searchGet } from "../api.js"
import { CACHE_TTL } from "../constants.js"
import { errorResponse, textResponse } from "../format.js"

/**
 * Search for users or organizations on the LPM registry.
 *
 * @param {{ query: string, limit?: number }} params
 * @param {{ cache: import('../cache.js').MemoryCache, getToken: () => Promise<string|null>, getBaseUrl: () => string }} ctx
 */
export async function searchOwners({ query, limit }, ctx) {
	if (!query || query.trim().length < 1) {
		return errorResponse("Search query is required.")
	}

	const q = query.trim()
	const safeLimit = Math.min(Math.max(limit || 5, 1), 10)

	const cacheKey = `search-owners:${q}:${safeLimit}`
	const cached = ctx.cache.get(cacheKey)
	if (cached) return cached

	const token = await ctx.getToken()
	const baseUrl = ctx.getBaseUrl()
	const params = new URLSearchParams({ q, limit: String(safeLimit) })

	const result = await searchGet(`/owners?${params.toString()}`, token, baseUrl)

	if (!result.ok) {
		return errorResponse(
			result.data?.error || `Search failed (${result.status})`,
		)
	}

	const owners = result.data?.owners || []

	if (owners.length === 0) {
		const response = textResponse(`No users or organizations found for "${q}".`)
		ctx.cache.set(cacheKey, response, CACHE_TTL.SHORT)
		return response
	}

	const lines = [
		`Found ${owners.length} profile${owners.length === 1 ? "" : "s"}:\n`,
	]

	for (const owner of owners) {
		const type = owner.type === "org" ? "org" : "user"
		const name =
			owner.name && owner.name !== owner.slug ? ` (${owner.name})` : ""
		const bio = owner.bio ? ` — ${owner.bio.substring(0, 80)}` : ""
		lines.push(`- @${owner.slug}${name} [${type}]${bio}`)
	}

	const response = textResponse(lines.join("\n"))
	ctx.cache.set(cacheKey, response, CACHE_TTL.SHORT)
	return response
}
