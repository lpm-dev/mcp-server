import { runCli } from "../cli.js"
import { cliResponse, errorResponse, parseName } from "../format.js"

/**
 * Install an LPM package as a dependency via the CLI.
 * Installs to node_modules like npm install.
 *
 * @param {{ name: string, version?: string }} params
 */
export async function install({ name, version }) {
	let owner, pkgName
	try {
		const parsed = parseName(name)
		owner = parsed.owner
		pkgName = parsed.name
	} catch (err) {
		return errorResponse(err.message)
	}

	let pkgRef = `@lpm.dev/${owner}.${pkgName}`
	if (version) pkgRef += `@${version}`

	const args = ["install", pkgRef, "--json"]

	const result = await runCli(args)

	return cliResponse(result)
}
