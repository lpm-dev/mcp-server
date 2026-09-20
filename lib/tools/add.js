import { runCli } from "../cli.js"
import { cliResponse, errorResponse, parseName } from "../format.js"

/**
 * Add an LPM package to the user's project via the CLI.
 * Extracts source files into the project for customization.
 *
 * @param {{ name: string, version?: string, path?: string, alias?: string, target?: string, force?: boolean, installDeps?: boolean, config?: Record<string, string> }} params
 */
export async function add({
	name,
	version,
	path,
	alias,
	target,
	force,
	installDeps,
	config,
}) {
	let owner, pkgName
	try {
		const parsed = parseName(name)
		owner = parsed.owner
		pkgName = parsed.name
	} catch (err) {
		return errorResponse(err.message)
	}

	// Build package reference with optional config params as URL query string
	let pkgRef = `@lpm.dev/${owner}.${pkgName}`
	if (version) pkgRef += `@${version}`

	// Append config params as inline config (e.g., ?styling=panda&component=dialog)
	if (config && typeof config === "object" && Object.keys(config).length > 0) {
		const params = new URLSearchParams(config)
		pkgRef += `?${params.toString()}`
	}

	// Build CLI args
	const args = ["add", pkgRef, "--yes", "--json"]

	if (path) args.push("--path", path)
	if (alias) args.push("--alias", alias)
	if (target) args.push("--target", target)
	if (force) args.push("--force")
	if (installDeps === false) args.push("--no-install-deps")

	const result = await runCli(args)

	return cliResponse(result)
}
