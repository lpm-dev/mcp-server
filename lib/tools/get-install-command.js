import { registryGet } from "../api.js"
import { CACHE_TTL } from "../constants.js"
import { errorResponse, parseName, textResponse } from "../format.js"

/**
 * Get the correct CLI install command for an LPM package.
 * Returns `lpm add` for source packages (components, blocks, MCP servers)
 * or `lpm install` for managed dependencies (JS to node_modules, Swift to Package.swift).
 *
 * @param {{ name: string, version?: string }} params
 * @param {{ cache: import('../cache.js').MemoryCache, getToken: () => Promise<string|null>, getBaseUrl: () => string }} ctx
 */
export async function getInstallCommand({ name, version }, ctx) {
	let owner, pkgName
	try {
		const parsed = parseName(name)
		owner = parsed.owner
		pkgName = parsed.name
	} catch (err) {
		return errorResponse(err.message)
	}

	const fullName = `@lpm.dev/${owner}.${pkgName}`
	const versionSuffix = version ? `@${version}` : ""

	const token = await ctx.getToken()
	const cacheKey = `install-cmd:${owner}.${pkgName}:auth=${!!token}`

	const cached = ctx.cache.get(cacheKey)
	if (cached) return cached

	const baseUrl = ctx.getBaseUrl()
	const result = await registryGet(`/${fullName}`, token, baseUrl)

	if (!result.ok) {
		// Fallback: return `lpm install` as the default command when metadata is unavailable
		if (result.status === 404) {
			return errorResponse(`Package ${fullName} not found.`)
		}
		const response = textResponse(`lpm install ${fullName}${versionSuffix}`)
		return response
	}

	const data = result.data
	const ecosystem = data.ecosystem || "js"
	const packageType = data.packageType || "package"

	// Source packages (components, blocks, templates) use `lpm add`
	// Everything else uses `lpm install` (JS → node_modules, Swift → Package.swift)
	const sourceTypes = new Set(["component", "block", "template", "mcp-server"])
	const useAdd =
		sourceTypes.has(packageType) || data.lpmSource || data.hasLpmConfig

	const command = useAdd
		? `lpm add ${fullName}${versionSuffix}`
		: `lpm install ${fullName}${versionSuffix}`

	const explanation = useAdd
		? "Extracts source files into your project for customization."
		: ecosystem === "swift"
			? "Installs as a managed dependency via SE-0292 (edits Package.swift)."
			: "Installs as a dependency in node_modules (like npm install)."

	const response = textResponse(
		JSON.stringify(
			{ command, method: useAdd ? "add" : "install", explanation },
			null,
			2,
		),
	)
	ctx.cache.set(cacheKey, response, CACHE_TTL.SHORT)
	return response
}
