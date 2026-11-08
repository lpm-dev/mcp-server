import { registryGet } from "../api.js"
import { CACHE_TTL, MAX_SOURCE_TREE_ENTRIES } from "../constants.js"
import { errorResponse, parseName, textResponse } from "../format.js"

/**
 * Browse source code of an LPM package.
 *
 * Calls the registry source browsing API endpoint:
 *   GET /api/registry/@lpm.dev/{owner}.{name}/source?version=...&path=...
 *
 * - Without `path`: returns file tree only (use this first to explore structure)
 * - With `path`: returns file tree + source contents for matching files/directory
 *
 * @param {{ name: string, version?: string, path?: string }} params
 * @param {{ cache: import('../cache.js').MemoryCache, getToken: () => Promise<string|null>, getBaseUrl: () => string }} ctx
 */
export async function browseSource({ name, version, path }, ctx) {
	let owner, pkgName
	try {
		const parsed = parseName(name)
		owner = parsed.owner
		pkgName = parsed.name
	} catch (err) {
		return errorResponse(err.message)
	}

	const token = await ctx.getToken()
	if (!token) {
		return errorResponse(
			"Authentication required to browse source code. Set LPM_TOKEN environment variable.",
		)
	}

	// Build cache key (includes path for content requests)
	const cacheKey = `browse-source:${owner}.${pkgName}:${version || "latest"}:${path || ""}`
	const cached = ctx.cache.get(cacheKey)
	if (cached) return cached

	// Build query string
	// path can be "" (all files), a specific path, or undefined (tree only)
	const params = new URLSearchParams()
	if (version) params.set("version", version)
	if (path != null) params.set("path", path)
	const qs = params.toString()

	const baseUrl = ctx.getBaseUrl()
	const url = `/@lpm.dev/${owner}.${pkgName}/source${qs ? `?${qs}` : ""}`
	const result = await registryGet(url, token, baseUrl)

	if (!result.ok) {
		if (result.status === 404) {
			const versionLabel = version || "latest"
			return errorResponse(
				`Version ${versionLabel} not found for @lpm.dev/${owner}.${pkgName}.`,
			)
		}
		if (result.status === 401) {
			return errorResponse(
				"Authentication failed. Your token may be expired. Run `lpm login` to re-authenticate.",
			)
		}
		if (result.status === 403) {
			return errorResponse(
				result.data?.error ||
					"Access denied. You may need a Pool subscription or license to browse this package.",
			)
		}
		if (result.status === 429) {
			return errorResponse("Rate limit exceeded. Wait a minute and try again.")
		}
		if (result.status === 503) {
			return errorResponse("Source browsing is currently disabled.")
		}
		return errorResponse(
			result.data?.error || `Request failed (${result.status})`,
		)
	}

	const data = result.data

	// Format response
	const response = {
		package: data.package,
		version: data.version,
		ecosystem: data.ecosystem,
	}

	// The whole tree when it fits. A tarball can hold 20,000 entries, so a
	// larger tree lists the paths under the requested directory, if any, up
	// to the limit, and says how many there are by top-level entry.
	const fullTree = Array.isArray(data.tree) ? data.tree : []
	const directory = path ? path.replace(/^\/+|\/+$/g, "") : ""
	const tree =
		fullTree.length > MAX_SOURCE_TREE_ENTRIES && directory
			? fullTree.filter(
					entry => entry === directory || entry.startsWith(`${directory}/`),
				)
			: fullTree
	response.tree = tree.slice(0, MAX_SOURCE_TREE_ENTRIES)
	if (tree.length > MAX_SOURCE_TREE_ENTRIES) {
		response.treeTotal = tree.length
		response.treeTruncated = true
		response.treeSummary = summarizeTree(tree, directory)
	}

	// Include files if present (only when path was requested)
	if (data.files && data.files.length > 0) {
		response.files = data.files
	}

	const warnings = []
	if (response.treeTruncated) {
		warnings.push(
			directory
				? `The tree lists the first ${MAX_SOURCE_TREE_ENTRIES} of ${tree.length} paths under ${directory}; treeSummary counts them by entry. Pass a deeper \`path\` to narrow it.`
				: `The tree lists the first ${MAX_SOURCE_TREE_ENTRIES} of ${tree.length} paths; treeSummary counts them by top-level entry. Pass a directory as \`path\` to list its files.`,
		)
	}
	if (data.truncated) {
		response.truncated = true
		warnings.push(
			"Response was truncated due to size limits. Use the `path` parameter to request specific files or directories.",
		)
	}
	if (warnings.length) response.warning = warnings.join(" ")

	// Include package config if present (helps AI understand package structure)
	if (data.lpmConfig) {
		response.lpmConfig = data.lpmConfig
	}

	const mcpResponse = textResponse(JSON.stringify(response, null, 2))
	ctx.cache.set(cacheKey, mcpResponse, CACHE_TTL.SHORT)
	return mcpResponse
}

const MAX_SUMMARY_ENTRIES = 100

/**
 * The number of paths under each entry directly below `directory` (the root
 * when empty), most first, at most MAX_SUMMARY_ENTRIES of them.
 *
 * @param {string[]} tree
 * @param {string} directory
 * @returns {Array<{ path: string, files: number }>}
 */
function summarizeTree(tree, directory) {
	const prefix = directory ? `${directory}/` : ""
	const counts = new Map()
	for (const entry of tree) {
		const rest = entry.startsWith(prefix) ? entry.slice(prefix.length) : entry
		const slash = rest.indexOf("/")
		const key = prefix + (slash === -1 ? rest : rest.slice(0, slash + 1))
		counts.set(key, (counts.get(key) ?? 0) + 1)
	}
	return [...counts]
		.sort(
			([a, countA], [b, countB]) =>
				countB - countA || (a < b ? -1 : a > b ? 1 : 0),
		)
		.slice(0, MAX_SUMMARY_ENTRIES)
		.map(([path, files]) => ({ path, files }))
}
