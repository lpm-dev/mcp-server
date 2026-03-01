import { execFile, execSync } from 'node:child_process'

const CLI_TIMEOUT_MS = 60_000

/**
 * Resolve the path to the `lpm` CLI binary.
 *
 * Resolution order:
 * 1. LPM_CLI_PATH env var (explicit override)
 * 2. `which lpm` (global install)
 * 3. null (caller should handle fallback)
 *
 * @returns {string|null}
 */
export function resolveCli() {
	// 1. Explicit override
	const envPath = process.env.LPM_CLI_PATH
	if (envPath) return envPath

	// 2. Global install
	try {
		const result = execSync('which lpm', { encoding: 'utf-8', timeout: 5_000 }).trim()
		if (result) return result
	} catch {
		// not found
	}

	return null
}

/**
 * Run an LPM CLI command and return parsed JSON output.
 *
 * @param {string[]} args - CLI arguments (e.g., ['add', '@lpm.dev/owner.pkg', '--json'])
 * @param {{ timeout?: number }} options
 * @returns {Promise<{ success: boolean, data: object|null, error: string|null }>}
 */
export async function runCli(args, options = {}) {
	const cliPath = resolveCli()

	if (!cliPath) {
		return {
			success: false,
			data: null,
			error: 'LPM CLI not found. Install it with: npm install -g @lpm-registry/cli',
		}
	}

	const timeout = options.timeout || CLI_TIMEOUT_MS

	return new Promise((resolve) => {
		const child = execFile(cliPath, args, {
			timeout,
			maxBuffer: 10 * 1024 * 1024,
			env: { ...process.env },
		}, (err, stdout, stderr) => {
			if (err && !stdout) {
				// CLI failed without producing output
				const message = err.killed
					? `CLI command timed out after ${timeout / 1000}s`
					: err.message || 'CLI command failed'
				resolve({ success: false, data: null, error: message })
				return
			}

			// Try to parse JSON from stdout
			try {
				const data = JSON.parse(stdout)
				resolve({
					success: data.success !== false,
					data,
					error: data.success === false
						? (data.errors?.[0] || 'Command failed')
						: null,
				})
			} catch {
				// CLI produced output but not valid JSON
				resolve({
					success: false,
					data: null,
					error: stderr?.trim() || stdout?.trim() || 'CLI returned non-JSON output',
				})
			}
		})
	})
}
