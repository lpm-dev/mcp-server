import { runCli } from "../cli.js"
import { errorResponse, parseName, textResponse } from "../format.js"

/**
 * Install an LPM package as a dependency via the CLI.
 * Installs to node_modules like npm install.
 *
 * @param {{ name: string, version?: string }} params
 * @param {{ getToken: () => Promise<string|null> }} ctx
 */
export async function install({ name, version }, ctx) {
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
			"Authentication required. Set LPM_TOKEN environment variable or run `lpm login`.",
		)
	}

	let pkgRef = `@lpm.dev/${owner}.${pkgName}`
	if (version) pkgRef += `@${version}`

	const args = ["install", pkgRef, "--json"]

	const result = await runCli(args)

	if (!result.success) {
		return errorResponse(result.error || "Failed to install package.")
	}

	const data = result.data
	const summary = {
		success: true,
		packages: data.packages || [{ name: pkgRef }],
		npmOutput: data.npmOutput || "",
	}

	if (data.warnings?.length > 0) {
		summary.warnings = data.warnings
	}

	return textResponse(JSON.stringify(summary, null, 2))
}
