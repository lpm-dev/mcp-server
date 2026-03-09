import { registryGet } from "../api.js"
import { CACHE_TTL } from "../constants.js"
import { errorResponse, parseName, textResponse } from "../format.js"
import { getInstallMethod } from "./package-info.js"

const MAX_README_CHARS = 500

/**
 * Fetch combined context for an LPM package in a single call.
 * Merges package metadata, API docs, and LLM context from 3 parallel API calls.
 *
 * @param {{ name: string, version?: string }} params
 * @param {{ cache: import('../cache.js').MemoryCache, getToken: () => Promise<string|null>, getBaseUrl: () => string }} ctx
 */
export async function packageContext({ name, version }, ctx) {
	let owner, pkgName
	try {
		const parsed = parseName(name)
		owner = parsed.owner
		pkgName = parsed.name
	} catch (err) {
		return errorResponse(err.message)
	}

	const token = await ctx.getToken()
	const queryName = `${owner}.${pkgName}`
	const versionKey = version || "latest"
	const cacheKey = `package-context:${queryName}:${versionKey}:auth=${!!token}`

	const cached = ctx.cache.get(cacheKey)
	if (cached) return cached

	const baseUrl = ctx.getBaseUrl()

	// Build query params for api-docs and llm-context
	const docsParams = new URLSearchParams({ name: queryName })
	if (version) docsParams.set("version", version)
	const contextParams = new URLSearchParams({ name: queryName })
	if (version) contextParams.set("version", version)

	// Fire all 3 API calls in parallel
	const [infoResult, docsResult, contextResult] = await Promise.allSettled([
		registryGet(`/@lpm.dev/${queryName}`, token, baseUrl),
		registryGet(`/api-docs?${docsParams}`, token, baseUrl),
		registryGet(`/llm-context?${contextParams}`, token, baseUrl),
	])

	// Package info is required — fail if it fails
	const info = infoResult.status === "fulfilled" ? infoResult.value : null

	if (!info || !info.ok) {
		const status = info?.status
		if (status === 404) {
			return errorResponse(`Package @lpm.dev/${queryName} not found.`)
		}
		if (status === 401) {
			return errorResponse(
				"Authentication required for this private package. Set LPM_TOKEN env var.",
			)
		}
		if (status === 403) {
			return errorResponse(
				info?.data?.error ||
					"Access denied. This package may require a license.",
			)
		}
		return errorResponse(
			info?.data?.error || `Request failed${status ? ` (${status})` : ""}`,
		)
	}

	// Build condensed package info
	const data = info.data
	const versions = data.versions ? Object.keys(data.versions) : []
	const latestTag = data["dist-tags"]?.latest
	const latestVersion =
		latestTag && data.versions?.[latestTag] ? data.versions[latestTag] : null

	const ecosystem = data.ecosystem || "js"
	const packageType = data.packageType || "package"
	const installMethod = getInstallMethod(packageType, ecosystem)

	let readme = data.readme || latestVersion?.readme || ""
	if (readme.length > MAX_README_CHARS) {
		readme =
			readme.substring(0, MAX_README_CHARS) +
			"\n\n[truncated — use lpm_package_info for full readme]"
	}

	const packageSummary = {
		name: data.name,
		description: data.description || latestVersion?.description || "",
		ecosystem,
		latestVersion: latestTag || versions[versions.length - 1] || "N/A",
		license: latestVersion?.license || data.license || null,
		dependencies: latestVersion?.dependencies
			? Object.keys(latestVersion.dependencies)
			: [],
		peerDependencies: latestVersion?.peerDependencies
			? Object.keys(latestVersion.peerDependencies)
			: [],
		installMethod,
		...(packageType !== "package" && { packageType }),
		...(data.distributionMode && { distributionMode: data.distributionMode }),
		readme,
	}

	// Extract api docs (graceful — omit if unavailable)
	let apiDocs = null
	if (docsResult.status === "fulfilled" && docsResult.value.ok) {
		const docsData = docsResult.value.data
		if (docsData.available) {
			apiDocs = docsData.apiDocs || null
		}
	}

	// Extract llm context (graceful — omit if unavailable)
	let llmContext = null
	if (contextResult.status === "fulfilled" && contextResult.value.ok) {
		const ctxData = contextResult.value.data
		if (ctxData.available) {
			llmContext = ctxData.llmContext || null
		}
	}

	// Assemble combined result — omit unavailable keys entirely
	const combined = {
		package: packageSummary,
		...(apiDocs && { apiDocs }),
		...(llmContext && { llmContext }),
	}

	const response = textResponse(JSON.stringify(combined, null, 2))
	ctx.cache.set(cacheKey, response, CACHE_TTL.SHORT)
	return response
}
