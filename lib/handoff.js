import { execFile, spawn } from "node:child_process"
import { constants } from "node:os"
import { resolveCli } from "./cli.js"

/**
 * Set for the LPM CLI's server. An older CLI ignores it and starts this
 * package again, which then serves its own tools instead of handing off.
 */
export const HANDOFF_ENV = "LPM_MCP_NPM_HANDOFF"

const NATIVE_SERVER_RELEASE = { major: 0, minor: 86, patch: 0 }
const PROBE_TIMEOUT_MS = 10_000
const PROBE_MAX_BYTES = 4096
const VERSION_LINE =
	/^lpm (0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

/** Parse the first line of `lpm --version`. */
export function parseCliVersion(output) {
	if (typeof output !== "string") return null
	const match = VERSION_LINE.exec(output.split(/\r?\n/, 1)[0].trim())
	if (!match) return null
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		prerelease: match[4] ?? null,
	}
}

/** Whether an LPM CLI version has `lpm mcp serve` as its own server. */
export function servesMcpNatively(version) {
	for (const part of ["major", "minor", "patch"]) {
		if (version[part] !== NATIVE_SERVER_RELEASE[part]) {
			return version[part] > NATIVE_SERVER_RELEASE[part]
		}
	}
	// A prerelease sorts before its release, and 0.86.0's nightlies predate the
	// native server. Earlier CLIs' `lpm mcp serve` runs this package.
	return version.prerelease === null
}

/** Run `lpm --version`, resolving its output, or null when it fails. */
export function probeCliVersion(cli) {
	return new Promise(resolve => {
		execFile(
			cli,
			["--version"],
			{
				timeout: PROBE_TIMEOUT_MS,
				maxBuffer: PROBE_MAX_BYTES,
				windowsHide: true,
			},
			(error, stdout) => resolve(error ? null : stdout),
		)
	})
}

/** Find an LPM CLI whose `lpm mcp serve` is its own server. */
export async function findNativeServer({
	env = process.env,
	resolve = resolveCli,
	probe = probeCliVersion,
} = {}) {
	if (env[HANDOFF_ENV]) return null
	const cli = resolve()
	if (!cli) return null
	const version = parseCliVersion(await probe(cli))
	return version && servesMcpNatively(version) ? cli : null
}

/**
 * Run `<cli> mcp serve` on this process's stdio, passing stop signals on.
 *
 * Resolves `{ started: false, error }` when the CLI could not start, before
 * anything read stdin, and `{ started: true, code, signal }` when it exits.
 */
export function runNativeServer(
	cli,
	{ env = process.env, stdio = "inherit" } = {},
) {
	return new Promise(resolve => {
		const signals =
			process.platform === "win32"
				? ["SIGINT", "SIGTERM", "SIGBREAK"]
				: ["SIGINT", "SIGTERM", "SIGHUP"]
		const forward = signal => child.kill(signal)
		let started = false
		const child = spawn(cli, ["mcp", "serve"], {
			stdio,
			env: { ...env, [HANDOFF_ENV]: "1" },
			windowsHide: true,
		})
		child.once("spawn", () => {
			started = true
			for (const signal of signals) process.on(signal, forward)
		})
		child.once("error", error => {
			if (!started) resolve({ started: false, error })
		})
		child.once("exit", (code, signal) => {
			for (const name of signals) process.off(name, forward)
			resolve({ started: true, code, signal })
		})
	})
}

/** End this process the way the CLI's server ended. */
export function exitLike({ code, signal }) {
	if (signal) {
		process.kill(process.pid, signal)
		// Node ignores some signals, such as SIGPIPE, so raising one may return.
		process.exit(128 + (constants.signals[signal] ?? 0))
	}
	process.exit(code ?? 1)
}
