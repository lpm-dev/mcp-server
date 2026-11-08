import { textGet } from "../api.js"
import { CACHE_TTL } from "../constants.js"
import { errorResponse, textResponse } from "../format.js"

const DOCS_BASE_URL = "https://lpm.dev/api/docs"

/**
 * Search or read LPM documentation.
 *
 * - Without `page`: returns the full docs index (page titles and slugs).
 * - With `page`: returns the content of that specific documentation page.
 * - With `query`: searches page titles for matches and returns their content.
 *
 * @param {{ page?: string, query?: string }} params
 * @param {{ cache: import('../cache.js').MemoryCache }} ctx
 */
export async function docs({ page, query }, ctx) {
	// Mode 1: Fetch a specific page
	if (page) {
		const slug = page.replace(/^\//, "").replace(/\/$/, "")
		const cacheKey = `docs:page:${slug}`

		const cached = ctx.cache.get(cacheKey)
		if (cached) return cached

		const response = await textGet(`${DOCS_BASE_URL}/${slug}`)
		if (!response.ok) {
			if (response.status === 404) {
				return errorResponse(
					`Documentation page "${slug}" not found. Use this tool without a page parameter to see all available pages.`,
				)
			}
			return errorResponse(
				`Failed to fetch docs (${response.error ?? response.status})`,
			)
		}

		const result = textResponse(response.text)
		ctx.cache.set(cacheKey, result, CACHE_TTL.LONG)
		return result
	}

	// Mode 2: Search or list index
	const cacheKey = "docs:index"
	let indexText = ctx.cache.get(cacheKey)

	if (!indexText) {
		const response = await textGet(DOCS_BASE_URL)
		if (!response.ok) {
			return errorResponse(
				`Failed to fetch docs index (${response.error ?? response.status})`,
			)
		}
		indexText = response.text
		ctx.cache.set(cacheKey, indexText, CACHE_TTL.LONG)
	} else {
		// Cache stores the textResponse wrapper, extract the text
		indexText =
			typeof indexText === "string"
				? indexText
				: indexText?.content?.[0]?.text || indexText
	}

	// If query is provided, filter the index and fetch matching pages
	if (query) {
		const queryLower = query.toLowerCase()
		const lines =
			typeof indexText === "string"
				? indexText.split("\n")
				: String(indexText).split("\n")
		const matches = lines.filter(
			line => line.includes(" — ") && line.toLowerCase().includes(queryLower),
		)

		if (matches.length === 0) {
			return textResponse(
				`No documentation pages found matching "${query}".\n\nAvailable pages:\n${indexText}`,
			)
		}

		// Fetch content of matching pages (up to 3)
		const results = []
		const failures = []
		for (const match of matches.slice(0, 3)) {
			const slug = match.split(" — ")[0].trim()
			const response = await textGet(`${DOCS_BASE_URL}/${slug}`)
			if (response.ok) {
				results.push(`--- ${slug} ---\n${response.text}`)
			} else {
				failures.push(`${slug}: ${response.error ?? response.status}`)
			}
		}

		if (results.length === 0) {
			return errorResponse(
				`Failed to fetch the matching docs pages (${failures.join(", ")})`,
			)
		}
		if (failures.length) {
			results.push(`(Could not read: ${failures.join(", ")})`)
		}
		return textResponse(results.join("\n\n"))
	}

	// No query, no page — return the full index
	return textResponse(
		typeof indexText === "string" ? indexText : String(indexText),
	)
}
