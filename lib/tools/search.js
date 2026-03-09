import { searchGet } from "../api.js"
import { CACHE_TTL, ERROR_MESSAGES } from "../constants.js"
import { errorResponse, textResponse } from "../format.js"

/**
 * Unified LPM package search.
 *
 * Uses dual-endpoint strategy:
 * - Semantic path (/packages?mode=semantic): when only query + ecosystem/limit are provided
 * - Explore path (/packages/explore): when any structured filter is active
 *
 * @param {object} params
 * @param {string} [params.query] - Search text (required unless category provided)
 * @param {string} [params.category] - Category slug filter
 * @param {string} [params.ecosystem] - Ecosystem filter (js, swift, xcframework)
 * @param {string} [params.distribution] - Distribution mode filter (marketplace, pool, private)
 * @param {string} [params.packageType] - Package type filter
 * @param {string} [params.sort] - Sort order (newest, popular, name)
 * @param {boolean} [params.hasTypes] - TypeScript types filter
 * @param {string} [params.moduleType] - Module type filter (esm, cjs, dual)
 * @param {string} [params.license] - License filter
 * @param {string} [params.minNodeVersion] - Min Node version filter
 * @param {number} [params.limit] - Max results (1-50, default 10)
 * @param {{ cache: import('../cache.js').MemoryCache, getToken: () => Promise<string|null>, getBaseUrl: () => string }} ctx
 */
export async function search(params, ctx) {
	const {
		query,
		category,
		distribution,
		packageType,
		sort,
		hasTypes,
		moduleType,
		license,
		minNodeVersion,
	} = params

	// Validation: at least query or category required
	if (!query?.trim() && !category) {
		return errorResponse(ERROR_MESSAGES.searchNoParams)
	}
	if (query && query.trim().length < 2) {
		return errorResponse("Search query must be at least 2 characters.")
	}

	const token = await ctx.getToken()
	const baseUrl = ctx.getBaseUrl()

	// Determine which path to use
	const hasStructuredFilters =
		category ||
		distribution ||
		packageType ||
		sort ||
		hasTypes ||
		moduleType ||
		license ||
		minNodeVersion

	// Build deterministic cache key from all params
	const cacheKey = buildCacheKey(params)
	const cached = ctx.cache.get(cacheKey)
	if (cached) return cached

	let response
	if (hasStructuredFilters) {
		response = await exploreSearch(params, token, baseUrl)
	} else {
		response = await semanticSearch(params, token, baseUrl)
	}

	if (response.isError) return response

	ctx.cache.set(cacheKey, response, CACHE_TTL.SHORT)
	return response
}

/**
 * Semantic search path — best quality for natural language queries.
 * Uses /api/search/packages?mode=semantic
 */
async function semanticSearch({ query, ecosystem, limit }, token, baseUrl) {
	const q = query.trim()
	const safeLimit = Math.min(Math.max(limit || 10, 1), 20)

	const searchParams = new URLSearchParams({
		q,
		mode: "semantic",
		limit: String(safeLimit),
	})
	if (ecosystem) searchParams.set("ecosystem", ecosystem)

	const result = await searchGet(
		`/packages?${searchParams.toString()}`,
		token,
		baseUrl,
	)

	if (!result.ok) {
		return errorResponse(
			result.data?.error || `Search failed (${result.status})`,
		)
	}

	const packages = result.data?.packages || []
	return formatResults(packages, query)
}

/**
 * Explore search path — supports all structured filters.
 * Uses /api/search/packages/explore
 */
async function exploreSearch(params, token, baseUrl) {
	const {
		query,
		category,
		ecosystem,
		distribution,
		packageType,
		sort,
		hasTypes,
		moduleType,
		license,
		minNodeVersion,
		limit,
	} = params

	const safeLimit = Math.min(Math.max(limit || 10, 1), 50)

	const searchParams = new URLSearchParams()
	if (query?.trim()) searchParams.set("q", query.trim())
	if (category) searchParams.set("category", category)
	if (ecosystem) searchParams.set("ecosystem", ecosystem)
	if (distribution) searchParams.set("distribution", distribution)
	if (packageType) searchParams.set("packageType", packageType)
	if (sort) searchParams.set("sort", sort)
	if (hasTypes) searchParams.set("hasTypes", "true")
	if (moduleType) searchParams.set("moduleType", moduleType)
	if (license) searchParams.set("license", license)
	if (minNodeVersion) searchParams.set("minNodeVersion", minNodeVersion)
	searchParams.set("limit", String(safeLimit))

	const result = await searchGet(
		`/packages/explore?${searchParams.toString()}`,
		token,
		baseUrl,
	)

	if (!result.ok) {
		return errorResponse(
			result.data?.error || `Search failed (${result.status})`,
		)
	}

	const packages = result.data?.packages || []
	return formatResults(packages, query)
}

/**
 * Format search results as readable text for LLM consumption.
 * Handles both semantic and explore response shapes.
 */
function formatResults(packages, query) {
	if (packages.length === 0) {
		const label = query?.trim() ? ` for "${query.trim()}"` : ""
		return textResponse(`No packages found${label}.`)
	}

	const lines = [
		`Found ${packages.length} package${packages.length === 1 ? "" : "s"}:\n`,
	]

	for (const pkg of packages) {
		const owner = pkg.ownerSlug || pkg.owner
		const name = `${owner}.${pkg.name}`

		// Type badge (skip default "package")
		const typeLabel =
			pkg.packageType && pkg.packageType !== "package"
				? ` [${pkg.packageType}]`
				: ""

		// Ecosystem badge (skip default "js")
		const ecosystemLabel =
			pkg.ecosystem && pkg.ecosystem !== "js" ? ` {${pkg.ecosystem}}` : ""

		// Distribution mode
		const distLabel = pkg.distributionMode ? ` (${pkg.distributionMode})` : ""

		const desc = pkg.description ? ` — ${pkg.description}` : ""
		const downloads = pkg.downloadCount
			? ` (${Number(pkg.downloadCount).toLocaleString()} downloads)`
			: ""

		lines.push(
			`- ${name}${typeLabel}${ecosystemLabel}${distLabel}${desc}${downloads}`,
		)

		// Second line with extra metadata (from explore path)
		const meta = []
		if (pkg.qualityScore != null) meta.push(`Quality: ${pkg.qualityScore}`)
		if (pkg.category) meta.push(`Category: ${pkg.category}`)
		if (pkg.tags?.length > 0) meta.push(`Tags: ${pkg.tags.join(", ")}`)
		if (meta.length > 0) {
			lines.push(`  ${meta.join(" | ")}`)
		}
	}

	return textResponse(lines.join("\n"))
}

/**
 * Build a deterministic cache key from all search params.
 */
function buildCacheKey(params) {
	const parts = [
		"search",
		params.query?.trim() || "",
		params.category || "",
		params.ecosystem || "",
		params.distribution || "",
		params.packageType || "",
		params.sort || "",
		params.hasTypes ? "types" : "",
		params.moduleType || "",
		params.license || "",
		params.minNodeVersion || "",
		String(params.limit || 10),
	]
	return parts.join(":")
}
