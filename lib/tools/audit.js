import { runCli } from "../cli.js"
import { cliResponse } from "../format.js"

/**
 * Run a security audit on the project's LPM dependencies.
 * Returns behavioral tags, AI security findings, quality scores, and lifecycle scripts.
 *
 * @param {{ path?: string }} params
 */
export async function audit({ path }) {
	const args = ["audit", "--json"]

	const result = await runCli(args, {
		timeout: 30_000,
		...(path && { cwd: path }),
	})

	return cliResponse(result)
}
