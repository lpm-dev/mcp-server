import { registryGet } from "../api.js"
import { CACHE_TTL } from "../constants.js"
import { errorResponse, parseName, textResponse } from "../format.js"

/**
 * Get the correct CLI install command for an LPM package.
 * Returns `lpm add` for source packages (components, blocks, MCP servers, Swift)
 * or `lpm install` for dependency packages (installed to node_modules).
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
		// Fallback: return `lpm add` as the default command when metadata is unavailable
		if (result.status === 404) {
			return errorResponse(`Package ${fullName} not found.`)
		}
		const response = textResponse(`lpm add ${fullName}${versionSuffix}`)
		return response
	}

	const data = result.data
	const ecosystem = data.ecosystem || "js"
	const packageType = data.packageType || "package"

	// Source-based packages use `lpm add` (extracts files into the project)
	// Only plain JS packages without a special type use `lpm install` (node_modules)
	const useAdd =
		ecosystem !== "js" ||
		packageType !== "package" ||
		data.lpmSource ||
		data.hasLpmConfig

	const command = useAdd
		? `lpm add ${fullName}${versionSuffix}`
		: `lpm install ${fullName}${versionSuffix}`

	const explanation = useAdd
		? "Extracts source files into your project for customization."
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
