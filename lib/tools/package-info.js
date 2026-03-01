import { registryGet } from '../api.js'
import { CACHE_TTL } from '../constants.js'
import { errorResponse, parseName, textResponse } from '../format.js'

/**
 * Fetch metadata for an LPM package.
 *
 * @param {{ name: string }} params
 * @param {{ cache: import('../cache.js').MemoryCache, getToken: () => Promise<string|null>, getBaseUrl: () => string }} ctx
 */
export async function packageInfo({ name }, ctx) {
	let owner, pkgName
	try {
		const parsed = parseName(name)
		owner = parsed.owner
		pkgName = parsed.name
	} catch (err) {
		return errorResponse(err.message)
	}

	const token = await ctx.getToken()
	const cacheKey = `package-info:${owner}.${pkgName}:auth=${!!token}`

	const cached = ctx.cache.get(cacheKey)
	if (cached) return cached

	const baseUrl = ctx.getBaseUrl()
	const result = await registryGet(
		`/@lpm.dev/${owner}.${pkgName}`,
		token,
		baseUrl,
	)

	if (!result.ok) {
		if (result.status === 404) {
			return errorResponse(`Package @lpm.dev/${owner}.${pkgName} not found.`)
		}
		if (result.status === 401) {
			return errorResponse('Authentication required for this private package. Set LPM_TOKEN env var.')
		}
		if (result.status === 403) {
			return errorResponse(result.data?.error || 'Access denied. This package may require a license.')
		}
		return errorResponse(result.data?.error || `Request failed (${result.status})`)
	}

	const data = result.data
	const versions = data.versions ? Object.keys(data.versions) : []
	const latestTag = data['dist-tags']?.latest
	const latestVersion = latestTag && data.versions?.[latestTag]
		? data.versions[latestTag]
		: null

	// Truncate readme
	let readme = data.readme || latestVersion?.readme || ''
	if (readme.length > 1000) {
		readme = readme.substring(0, 1000) + '\n\n[truncated]'
	}

	// Ecosystem and platform metadata
	const ecosystem = data.ecosystem || 'js'
	const versionMeta = latestVersion?.versionMeta || {}
	const platformInfo = {}
	if (ecosystem === 'swift' && versionMeta.swift) {
		platformInfo.swiftPlatforms = versionMeta.swift.platforms
		platformInfo.swiftToolsVersion = versionMeta.swift.toolsVersion
	}
	if (ecosystem === 'xcframework' && versionMeta.xcframework) {
		platformInfo.xcframeworkSlices = versionMeta.xcframework.slices
	}

	const summary = {
		name: data.name,
		description: data.description || latestVersion?.description || '',
		ecosystem,
		latestVersion: latestTag || versions[versions.length - 1] || 'N/A',
		totalVersions: versions.length,
		versions: versions.slice(-10).reverse(),
		downloads: data.downloads || 0,
		createdAt: data.createdAt || data.time?.created || null,
		updatedAt: data.updatedAt || data.time?.modified || null,
		dependencies: latestVersion?.dependencies
			? Object.keys(latestVersion.dependencies)
			: [],
		readme,
		// Package type (what kind of developer tool)
		...(data.packageType && data.packageType !== 'package' && { packageType: data.packageType }),
		// Distribution and access model
		...(data.distributionMode && { distributionMode: data.distributionMode }),
		...(data.accessInfo && { accessInfo: data.accessInfo }),
		// Platform-specific metadata (Swift platforms, XCFramework slices)
		...(Object.keys(platformInfo).length > 0 && platformInfo),
		// AI-generated metadata (only present if package has been analyzed)
		...(data.ai && { ai: data.ai }),
	}

	const response = textResponse(JSON.stringify(summary, null, 2))
	ctx.cache.set(cacheKey, response, CACHE_TTL.SHORT)
	return response
}
