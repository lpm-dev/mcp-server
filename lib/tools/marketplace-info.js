import { registryGet } from "../api.js"
import { CACHE_TTL } from "../constants.js"
import { errorResponse, parseName, textResponse } from "../format.js"

/**
 * Get marketplace information for an LPM package.
 * Returns pricing, licensing model, seat management details, and purchase status.
 *
 * @param {{ name: string }} params
 * @param {{ cache: import('../cache.js').MemoryCache, getToken: () => Promise<string|null>, getBaseUrl: () => string }} ctx
 */
export async function marketplaceInfo({ name }, ctx) {
	let owner, pkgName
	try {
		const parsed = parseName(name)
		owner = parsed.owner
		pkgName = parsed.name
	} catch (err) {
		return errorResponse(err.message)
	}

	const fullName = `@lpm.dev/${owner}.${pkgName}`
	const token = await ctx.getToken()
	const cacheKey = `marketplace-info:${owner}.${pkgName}:auth=${!!token}`

	const cached = ctx.cache.get(cacheKey)
	if (cached) return cached

	const baseUrl = ctx.getBaseUrl()
	const result = await registryGet(`/${fullName}`, token, baseUrl)

	if (!result.ok) {
		if (result.status === 404) {
			return errorResponse(`Package ${fullName} not found.`)
		}
		return errorResponse(
			result.data?.error || `Request failed (${result.status})`,
		)
	}

	const data = result.data
	const distributionMode = data.distributionMode || "private"

	if (distributionMode !== "marketplace") {
		const response = textResponse(
			JSON.stringify(
				{
					name: fullName,
					distributionMode,
					isMarketplace: false,
					message: `This package uses ${distributionMode} distribution, not marketplace.`,
				},
				null,
				2,
			),
		)
		ctx.cache.set(cacheKey, response, CACHE_TTL.SHORT)
		return response
	}

	const summary = {
		name: fullName,
		isMarketplace: true,
		distributionMode: "marketplace",
		description: data.description || "",
		// Pricing
		pricing: data.marketplace?.pricing || null,
		licenseType: data.marketplace?.licenseType || null,
		// Seat management
		seats: data.marketplace?.seats || null,
		// Access info for the current user
		accessInfo: data.accessInfo || null,
		// Latest version
		latestVersion: data["dist-tags"]?.latest || null,
	}

	const response = textResponse(JSON.stringify(summary, null, 2))
	ctx.cache.set(cacheKey, response, CACHE_TTL.SHORT)
	return response
}
