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
 * - With `treeOffset`: lists a long tree from that path onwards
 *
 * @param {{ name: string, version?: string, path?: string, treeOffset?: number }} params
 * @param {{ cache: import('../cache.js').MemoryCache, getToken: () => Promise<string|null>, getBaseUrl: () => string }} ctx
 */
export async function browseSource(
	{ name, version, path, treeOffset = 0 },
	ctx,
) {
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

	if (!Number.isSafeInteger(treeOffset) || treeOffset < 0) {
		return errorResponse("treeOffset must be a non-negative integer.")
	}

	// Build cache key (includes path for content requests)
	const cacheKey = `browse-source:${owner}.${pkgName}:${version || "latest"}:${path || ""}:${treeOffset}`
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

	Object.assign(response, treeListing(data.tree, path, treeOffset))

	// Include files if present (only when path was requested)
	if (data.files && data.files.length > 0) {
		response.files = data.files
	}

	const warnings = response.treeNote ? [response.treeNote] : []
	delete response.treeNote
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
 * The tree, or one page of it. A tree that fits is listed whole, as the
 * registry sends it. A tarball can hold 20,000 paths, so a longer one is
 * listed MAX_SOURCE_TREE_ENTRIES at a time from `offset`, scoped to `path`
 * when that names a directory with paths in it, with its total and a count
 * of paths by entry. Every path can be reached by paging, so none can hide
 * behind the limit.
 *
 * @param {unknown} tree
 * @param {string | undefined} path
 * @param {number} offset
 */
function treeListing(tree, path, offset) {
	const fullTree = Array.isArray(tree) ? tree : []
	if (fullTree.length <= MAX_SOURCE_TREE_ENTRIES && offset === 0) {
		return { tree: fullTree }
	}

	const directory = path ? trimSlashes(path, { leading: true }) : ""
	const scoped = directory
		? fullTree.filter(
				entry => entry === directory || entry.startsWith(`${directory}/`),
			)
		: fullTree
	const scope = directory && scoped.length > 0 ? directory : null
	const listed = scope ? scoped : fullTree
	const page = listed.slice(offset, offset + MAX_SOURCE_TREE_ENTRIES)
	const next = offset + page.length
	const summary = summarizeTree(listed, scope ?? "")

	const where = scope ? ` under ${scope}` : ""
	const notes = []
	if (directory && !scope) {
		notes.push(
			`No paths are under ${directory}; the tree lists the whole package.`,
		)
	}
	notes.push(
		page.length
			? `The tree lists paths ${offset + 1}–${next} of ${listed.length}${where}.`
			: `treeOffset ${offset} is past the ${listed.length} paths${where}.`,
	)
	if (next < listed.length) {
		notes.push(`Pass treeOffset ${next} for the next paths.`)
	}
	notes.push(
		summary.truncated
			? `treeSummary counts the ${MAX_SUMMARY_ENTRIES} largest of its ${summary.total} entries; page through the tree for the rest.`
			: "treeSummary counts its paths by entry.",
	)

	return {
		tree: page,
		treeTotal: listed.length,
		treeOffset: offset,
		treeScope: scope,
		treeTruncated: next < listed.length,
		treeSummary: summary.entries,
		...(summary.truncated ? { treeSummaryTruncated: true } : {}),
		treeNote: notes.join(" "),
	}
}

/**
 * The number of files under each entry directly below `directory` (the root
 * when empty), most first, at most MAX_SUMMARY_ENTRIES of them. A tree can
 * list directories as paths of their own; those aren't counted as files.
 *
 * @param {string[]} tree
 * @param {string} directory
 * @returns {{ entries: Array<{ path: string, files: number }>, total: number, truncated: boolean }}
 */
function summarizeTree(tree, directory) {
	const prefix = directory ? `${directory}/` : ""
	const rests = []
	const directories = new Set()
	for (const entry of tree) {
		if (prefix && !entry.startsWith(prefix)) continue
		const rest = trimSlashes(entry.slice(prefix.length))
		if (!rest) continue
		const slash = rest.indexOf("/")
		if (slash !== -1) directories.add(rest.slice(0, slash))
		rests.push(rest)
	}
	const counts = new Map()
	for (const rest of rests) {
		const slash = rest.indexOf("/")
		if (slash === -1 && directories.has(rest)) continue
		const key = prefix + (slash === -1 ? rest : rest.slice(0, slash + 1))
		counts.set(key, (counts.get(key) ?? 0) + 1)
	}
	const entries = [...counts]
		.sort(
			([a, countA], [b, countB]) =>
				countB - countA || (a < b ? -1 : a > b ? 1 : 0),
		)
		.map(([path, files]) => ({ path, files }))
	return {
		entries: entries.slice(0, MAX_SUMMARY_ENTRIES),
		total: entries.length,
		truncated: entries.length > MAX_SUMMARY_ENTRIES,
	}
}

/**
 * `text` without its trailing slashes, and its leading ones too with
 * `leading`. A loop, not /\/+$/: that pattern retries a run of slashes from
 * every offset when another character follows, and paths reach 32 KiB.
 *
 * @param {string} text
 * @param {{ leading?: boolean }} [options]
 */
function trimSlashes(text, { leading = false } = {}) {
	let start = 0
	let end = text.length
	if (leading) while (start < end && text[start] === "/") start++
	while (end > start && text[end - 1] === "/") end--
	return text.slice(start, end)
}
