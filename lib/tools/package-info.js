import { registryGet } from '../api.js'
import { CACHE_TTL } from '../constants.js'
import { errorResponse, parseName, textResponse } from '../format.js'

/** Source-extract types use `lpm add`, dependency types use `lpm install` */
const ADD_TYPES = new Set(['component', 'block', 'template', 'mcp-server'])

/**
 * Determine the recommended install method based on package type and ecosystem.
 * @param {string} packageType
 * @param {string} ecosystem
 * @returns {{ command: string, description: string }}
 */
export function getInstallMethod(packageType, ecosystem) {
	if (ecosystem === 'swift' || ecosystem === 'xcframework') {
		return {
			command: 'lpm add',
			description: 'Extracts Swift source files into your project',
		}
	}

	if (ADD_TYPES.has(packageType)) {
		return {
			command: 'lpm add',
			description: 'Extracts source files into your project for customization',
		}
	}

	if (packageType === 'dependency' || packageType === 'library') {
		return {
			command: 'lpm install',
			description: 'Installs as a dependency to node_modules (like npm install)',
		}
	}

	// Default: lpm add for source packages, lpm install for generic packages
	return {
		command: 'lpm add',
		description: 'Extracts source files into your project for customization',
	}
}

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

	// Include full readme, with a 50KB safety cap for extremely large READMEs
	const MAX_README_BYTES = 50_000
	let readme = data.readme || latestVersion?.readme || ''
	if (readme.length > MAX_README_BYTES) {
		readme = readme.substring(0, MAX_README_BYTES) + '\n\n[truncated — README exceeds 50KB]'
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

	// Determine recommended install method based on package type
	const packageType = data.packageType || 'package'
	const installMethod = getInstallMethod(packageType, ecosystem)

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
		...(packageType !== 'package' && { packageType }),
		// Distribution and access model
		...(data.distributionMode && { distributionMode: data.distributionMode }),
		...(data.accessInfo && { accessInfo: data.accessInfo }),
		// Recommended install method (lpm add vs lpm install)
		installMethod,
		// Whether the requesting user has access (true if we got a 200 response with auth)
		hasAccess: true,
		// Platform-specific metadata (Swift platforms, XCFramework slices)
		...(Object.keys(platformInfo).length > 0 && platformInfo),
		// AI-generated metadata (only present if package has been analyzed)
		...(data.ai && { ai: data.ai }),
	}

	const response = textResponse(JSON.stringify(summary, null, 2))
	ctx.cache.set(cacheKey, response, CACHE_TTL.SHORT)
	return response
}
