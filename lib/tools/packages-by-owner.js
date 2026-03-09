import { searchGet } from "../api.js"
import { CACHE_TTL } from "../constants.js"
import { errorResponse, textResponse } from "../format.js"

/**
 * List packages published by a specific user or organization.
 *
 * @param {{ owner: string, limit?: number }} params
 * @param {{ cache: import('../cache.js').MemoryCache, getToken: () => Promise<string|null>, getBaseUrl: () => string }} ctx
 */
export async function packagesByOwner({ owner, limit }, ctx) {
	if (!owner || owner.trim().length < 1) {
		return errorResponse("Owner username or slug is required.")
	}

	const slug = owner.trim().replace(/^@/, "")
	const safeLimit = Math.min(Math.max(limit || 10, 1), 50)

	const cacheKey = `packages-by-owner:${slug}:${safeLimit}`
	const cached = ctx.cache.get(cacheKey)
	if (cached) return cached

	const token = await ctx.getToken()
	const baseUrl = ctx.getBaseUrl()
	const params = new URLSearchParams({
		owner: slug,
		limit: String(safeLimit),
	})

	const result = await searchGet(
		`/packages/by-owner?${params.toString()}`,
		token,
		baseUrl,
	)

	if (!result.ok) {
		return errorResponse(
			result.data?.error || `Request failed (${result.status})`,
		)
	}

	const packages = result.data?.packages || []

	if (packages.length === 0) {
		const response = textResponse(`No public packages found for "${slug}".`)
		ctx.cache.set(cacheKey, response, CACHE_TTL.SHORT)
		return response
	}

	const lines = [
		`Found ${packages.length} package${packages.length === 1 ? "" : "s"} by ${slug}:\n`,
	]

	for (const pkg of packages) {
		const desc = pkg.description ? ` — ${pkg.description}` : ""
		const downloads = pkg.downloadCount
			? ` (${Number(pkg.downloadCount).toLocaleString()} downloads)`
			: ""
		const mode = pkg.distributionMode ? ` [${pkg.distributionMode}]` : ""
		lines.push(`- ${pkg.owner}.${pkg.name}${mode}${desc}${downloads}`)
	}

	const response = textResponse(lines.join("\n"))
	ctx.cache.set(cacheKey, response, CACHE_TTL.SHORT)
	return response
}
