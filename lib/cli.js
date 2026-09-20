import { execFile } from "node:child_process"
import { accessSync, constants, realpathSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

const CLI_TIMEOUT_MS = 60_000

/** Resolve an explicit CLI path or a global installation outside the caller's project. */
export function resolveCli(platform = process.platform) {
	const envPath = process.env.LPM_CLI_PATH
	if (envPath) return path.isAbsolute(envPath) ? envPath : null

	const workspace = realpathSync(process.cwd())
	for (const directory of (process.env.PATH || "").split(path.delimiter)) {
		if (!path.isAbsolute(directory)) continue
		const executable = globalExecutable(
			path.join(directory, platform === "win32" ? "lpm.exe" : "lpm"),
			workspace,
			platform,
		)
		if (executable) return executable
		if (platform !== "win32") continue

		// npm exposes a .cmd shim. Resolve its native dependency without a shell.
		try {
			const wrapper = path.join(
				directory,
				"node_modules",
				"@lpm-registry",
				"cli",
				"package.json",
			)
			if (!globalExecutable(wrapper, workspace, platform)) continue
			const require = createRequire(wrapper)
			const nativePackage = require.resolve(
				"@lpm-registry/cli-win32-x64/package.json",
			)
			const native = globalExecutable(
				path.join(path.dirname(nativePackage), "lpm.exe"),
				workspace,
				platform,
			)
			if (native) return native
		} catch {
			// Continue to the next PATH directory if optional native dependencies are absent.
		}
	}
	return null
}

function globalExecutable(candidate, workspace, platform) {
	try {
		const resolved = realpathSync(candidate)
		const relative = path.relative(workspace, resolved)
		if (
			relative === "" ||
			(!relative.startsWith(`..${path.sep}`) &&
				relative !== ".." &&
				!path.isAbsolute(relative))
		)
			return null
		if (!statSync(resolved).isFile()) return null
		accessSync(resolved, platform === "win32" ? constants.F_OK : constants.X_OK)
		return resolved
	} catch {
		return null
	}
}

/**
 * Run an LPM CLI command and return parsed JSON output.
 *
 * @param {string[]} args - CLI arguments (e.g., ['add', '@lpm.dev/owner.pkg', '--json'])
 * @param {{ timeout?: number, cwd?: string }} options
 * @returns {Promise<{ success: boolean, data: object|null, error: string|null }>}
 */
export async function runCli(args, options = {}) {
	const cliPath = resolveCli()

	if (!cliPath) {
		return {
			success: false,
			data: null,
			error:
				"LPM CLI not found. Install it with: npm install -g @lpm-registry/cli",
		}
	}

	const timeout = options.timeout || CLI_TIMEOUT_MS

	return new Promise(resolve => {
		const _child = execFile(
			cliPath,
			args,
			{
				timeout,
				cwd: options.cwd,
				maxBuffer: 10 * 1024 * 1024,
				env: { ...process.env },
			},
			(err, stdout, stderr) => {
				if (err && !stdout) {
					// CLI failed without producing output
					const message = err.killed
						? `CLI command timed out after ${timeout / 1000}s`
						: err.message || "CLI command failed"
					resolve({ success: false, data: null, error: message })
					return
				}

				// Try to parse JSON from stdout
				try {
					const data = JSON.parse(stdout)
					if (!data || typeof data !== "object" || Array.isArray(data)) {
						throw new Error("CLI returned an invalid result")
					}
					const success = !err && data.success !== false
					const reason =
						typeof data.error === "string" ? data.error : data.error?.message
					resolve({
						success,
						data,
						error: success
							? null
							: reason ||
								data.errors?.[0] ||
								(err?.killed
									? `CLI command timed out after ${timeout / 1000}s`
									: err?.message) ||
								"Command failed",
					})
				} catch {
					// CLI produced output but not valid JSON
					resolve({
						success: false,
						data: null,
						error:
							stderr?.trim() ||
							stdout?.trim() ||
							"CLI returned non-JSON output",
					})
				}
			},
		)
	})
}
