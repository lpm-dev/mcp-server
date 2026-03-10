import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"

/**
 * Resolve the installed version of an LPM package from the local package.json.
 * Walks up the directory tree to find the nearest package.json containing
 * the requested package in dependencies or devDependencies.
 *
 * @param {string} packageName - Package name (owner.name or @lpm.dev/owner.name)
 * @param {string} [cwd] - Starting directory (defaults to process.cwd())
 * @returns {string | null} - Resolved version string or null if not found
 */
export function resolveInstalledVersion(packageName, cwd) {
	// Normalize to @lpm.dev/ format for package.json lookup
	const lpmName = packageName.startsWith("@lpm.dev/")
		? packageName
		: `@lpm.dev/${packageName}`

	let dir = cwd || process.cwd()
	const _root = dirname(dir) === dir ? dir : undefined

	// Walk up directory tree (max 10 levels to avoid infinite loops)
	for (let i = 0; i < 10; i++) {
		const pkgPath = join(dir, "package.json")
		if (existsSync(pkgPath)) {
			try {
				const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
				const allDeps = {
					...pkg.dependencies,
					...pkg.devDependencies,
				}

				const version = allDeps[lpmName]
				if (version) {
					// Strip semver range chars (^, ~, >=, <=, >, <, =)
					return version.replace(/^[\^~>=<]+/, "")
				}
			} catch {
				// Invalid package.json, continue walking up
			}
		}

		const parent = dirname(dir)
		if (parent === dir) break // Reached filesystem root
		dir = parent
	}

	return null
}
