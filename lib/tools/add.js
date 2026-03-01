import { runCli } from '../cli.js'
import { errorResponse, parseName, textResponse } from '../format.js'

/**
 * Add an LPM package to the user's project via the CLI.
 * Extracts source files into the project for customization.
 *
 * @param {{ name: string, version?: string, path?: string, alias?: string, target?: string, force?: boolean, installDeps?: boolean, config?: Record<string, string> }} params
 * @param {{ getToken: () => Promise<string|null> }} ctx
 */
export async function add({ name, version, path, alias, target, force, installDeps, config }, ctx) {
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
		return errorResponse('Authentication required. Set LPM_TOKEN environment variable or run `lpm login`.')
	}

	// Build package reference with optional config params as URL query string
	let pkgRef = `@lpm.dev/${owner}.${pkgName}`
	if (version) pkgRef += `@${version}`

	// Append config params as inline config (e.g., ?styling=panda&component=dialog)
	if (config && typeof config === 'object' && Object.keys(config).length > 0) {
		const params = new URLSearchParams(config)
		pkgRef += `?${params.toString()}`
	}

	// Build CLI args
	const args = ['add', pkgRef, '--yes', '--json']

	if (path) args.push('--path', path)
	if (alias) args.push('--alias', alias)
	if (target) args.push('--target', target)
	if (force) args.push('--force')
	if (installDeps === false) args.push('--no-install-deps')

	const result = await runCli(args)

	if (!result.success) {
		return errorResponse(result.error || 'Failed to add package.')
	}

	// Format the result for the AI
	const data = result.data
	const summary = {
		success: true,
		package: data.package,
		installPath: data.installPath,
		alias: data.alias || null,
		files: (data.files || []).map(f => ({
			dest: f.dest,
			action: f.action,
		})),
		dependencies: data.dependencies || { npm: [], lpm: [] },
	}

	if (data.config && Object.keys(data.config).length > 0) {
		summary.config = data.config
	}

	if (data.warnings?.length > 0) {
		summary.warnings = data.warnings
	}

	return textResponse(JSON.stringify(summary, null, 2))
}
