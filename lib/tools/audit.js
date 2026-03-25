import { runCli } from "../cli.js"
import { errorResponse, textResponse } from "../format.js"

/**
 * Run a security audit on the project's LPM dependencies.
 * Returns behavioral tags, AI security findings, quality scores, and lifecycle scripts.
 *
 * @param {{ path?: string }} params
 * @param {{ getToken: () => Promise<string|null> }} ctx
 */
export async function audit({ path }, ctx) {
	const token = await ctx.getToken()
	if (!token) {
		return errorResponse(
			"Authentication required. Set LPM_TOKEN environment variable or run `lpm login`.",
		)
	}

	const args = ["audit", "--json"]

	const result = await runCli(args, {
		timeout: 30_000,
		...(path && { cwd: path }),
	})

	if (!result.success) {
		return errorResponse(result.error || "Failed to run audit.")
	}

	const data = result.data

	// Format for AI consumption
	const summary = {
		success: true,
		totalPackages: data.totalPackages || 0,
		packagesWithIssues: data.packagesWithIssues || 0,
		packages: (data.packages || []).map(pkg => ({
			name: pkg.name,
			version: pkg.version,
			qualityScore: pkg.qualityScore,
			issues: pkg.issues || [],
		})),
	}

	if (data.summary) {
		summary.summary = data.summary
	}

	return textResponse(JSON.stringify(summary, null, 2))
}
