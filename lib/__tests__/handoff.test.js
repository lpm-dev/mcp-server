import { spawn } from "node:child_process"
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
	findNativeServer,
	HANDOFF_ENV,
	parseCliVersion,
	runNativeServer,
	servesMcpNatively,
} from "../handoff.js"

const BIN = fileURLToPath(new URL("../../bin/mcp-server.js", import.meta.url))
const posix = process.platform !== "win32"

describe("parseCliVersion", () => {
	it("reads a release", () => {
		expect(parseCliVersion("lpm 0.86.0\n")).toEqual({
			major: 0,
			minor: 86,
			patch: 0,
			prerelease: null,
		})
	})

	it("reads a nightly", () => {
		expect(
			parseCliVersion("lpm 0.87.0-nightly.20261111.264.1d26c11\r\n"),
		).toEqual({
			major: 0,
			minor: 87,
			patch: 0,
			prerelease: "nightly.20261111.264.1d26c11",
		})
	})

	it("reads the version line above an update notice", () => {
		expect(
			parseCliVersion(
				"lpm 0.85.0\n\n  \u2b06 Update available: 0.85.0 \u2192 0.86.0 \u2014 run lpm self-update\n",
			),
		).toMatchObject({ major: 0, minor: 85, patch: 0, prerelease: null })
	})

	it("refuses output that is not an LPM CLI version", () => {
		for (const output of [
			null,
			"",
			"0.86.0",
			"npm 10.9.0",
			"lpm version 0.86.0",
			"lpm 0.86",
			"warning\nlpm 0.86.0",
		]) {
			expect(parseCliVersion(output)).toBeNull()
		}
	})
})

describe("servesMcpNatively", () => {
	const version = text => parseCliVersion(`lpm ${text}`)

	it("starts at LPM CLI 0.86.0", () => {
		expect(servesMcpNatively(version("0.85.9"))).toBe(false)
		expect(servesMcpNatively(version("0.86.0"))).toBe(true)
		expect(servesMcpNatively(version("0.86.1"))).toBe(true)
		expect(servesMcpNatively(version("0.100.0"))).toBe(true)
		expect(servesMcpNatively(version("1.0.0"))).toBe(true)
	})

	it("leaves out 0.86.0 nightlies, which were built before the native server", () => {
		expect(
			servesMcpNatively(version("0.86.0-nightly.20261109.260.daa536a")),
		).toBe(false)
		expect(
			servesMcpNatively(version("0.87.0-nightly.20261111.264.1d26c11")),
		).toBe(true)
	})
})

describe("findNativeServer", () => {
	const probeOf = output => async () => output

	it("returns a CLI that serves MCP itself", async () => {
		await expect(
			findNativeServer({
				env: {},
				resolve: () => "/opt/lpm",
				probe: probeOf("lpm 0.86.0\n"),
			}),
		).resolves.toBe("/opt/lpm")
	})

	it("keeps the bundled server for an older CLI", async () => {
		await expect(
			findNativeServer({
				env: {},
				resolve: () => "/opt/lpm",
				probe: probeOf("lpm 0.85.0\n"),
			}),
		).resolves.toBeNull()
	})

	it("keeps the bundled server when the version cannot be read", async () => {
		await expect(
			findNativeServer({
				env: {},
				resolve: () => "/opt/lpm",
				probe: probeOf(null),
			}),
		).resolves.toBeNull()
	})

	it("keeps the bundled server without a CLI", async () => {
		let probed = false
		await expect(
			findNativeServer({
				env: {},
				resolve: () => null,
				probe: async () => {
					probed = true
					return "lpm 0.86.0"
				},
			}),
		).resolves.toBeNull()
		expect(probed).toBe(false)
	})

	it("never hands off twice", async () => {
		let resolved = false
		await expect(
			findNativeServer({
				env: { [HANDOFF_ENV]: "1" },
				resolve: () => {
					resolved = true
					return "/opt/lpm"
				},
				probe: probeOf("lpm 0.86.0"),
			}),
		).resolves.toBeNull()
		expect(resolved).toBe(false)
	})
})

it("reports a CLI that cannot start without reading stdin", async () => {
	const missing = path.join(tmpdir(), "lpm-mcp-missing", "lpm")
	const result = await runNativeServer(missing, { stdio: "ignore" })
	expect(result.started).toBe(false)
	expect(result.error.code).toBe("ENOENT")
})

describe.skipIf(!posix)("the published executable", () => {
	let root
	beforeEach(() => {
		root = realpathSync(mkdtempSync(path.join(tmpdir(), "lpm-mcp-handoff-")))
	})
	afterEach(() => rmSync(root, { recursive: true, force: true }))

	function fakeCli(version, serve) {
		const executable = path.join(root, "lpm")
		writeFileSync(
			executable,
			[
				"#!/bin/sh",
				`if [ "$1" = "--version" ]; then echo "lpm ${version}"; exit 0; fi`,
				'if [ "$1" = "mcp" ] && [ "$2" = "serve" ]; then',
				`echo "$${HANDOFF_ENV}" > "${root}/handoff"`,
				serve,
				"fi",
				"exit 64",
				"",
			].join("\n"),
			{ mode: 0o755 },
		)
		return executable
	}

	function environment(cli) {
		const env = { ...process.env, LPM_CLI_PATH: cli }
		delete env[HANDOFF_ENV]
		return env
	}

	function start(cli) {
		const child = spawn(process.execPath, [BIN], {
			cwd: root,
			env: environment(cli),
			stdio: ["pipe", "pipe", "pipe"],
		})
		const exited = new Promise(resolve =>
			child.once("exit", (code, signal) => resolve({ code, signal })),
		)
		let stdout = ""
		child.stdout.setEncoding("utf8")
		const line = new Promise(resolve =>
			child.stdout.on("data", chunk => {
				stdout += chunk
				if (stdout.includes("\n")) resolve(stdout.split("\n", 1)[0])
			}),
		)
		return { child, exited, line }
	}

	async function connect(cli) {
		const client = new Client({ name: "test", version: "1.0.0" })
		await client.connect(
			new StdioClientTransport({
				command: process.execPath,
				args: [BIN],
				cwd: root,
				env: environment(cli),
				stderr: "ignore",
			}),
		)
		return client
	}

	it("hands its stdio to a CLI that serves MCP itself, requests sent at once included", async () => {
		const cli = fakeCli(
			"0.86.0",
			[
				`read request; printf '%s\\n' "$request" > "${root}/request"`,
				`printf '{"jsonrpc":"2.0","id":1,"result":{"handedOff":true}}\\n'`,
				"exit 3",
			].join("\n"),
		)
		const server = start(cli)
		const request = JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {},
		})
		server.child.stdin.write(`${request}\n`)

		expect(JSON.parse(await server.line).result.handedOff).toBe(true)
		expect(await server.exited).toEqual({ code: 3, signal: null })
		expect(readFileSync(path.join(root, "request"), "utf8").trim()).toBe(
			request,
		)
		expect(readFileSync(path.join(root, "handoff"), "utf8").trim()).toBe("1")
	})

	it("passes a stop signal on to the CLI's server", async () => {
		const cli = fakeCli(
			"0.86.0",
			[
				`trap 'echo stopped > "${root}/signal"; exit 0' TERM`,
				"echo ready",
				"while :; do sleep 0.05; done",
			].join("\n"),
		)
		const server = start(cli)
		expect(await server.line).toBe("ready")
		server.child.kill("SIGTERM")

		expect(await server.exited).toEqual({ code: 0, signal: null })
		expect(readFileSync(path.join(root, "signal"), "utf8").trim()).toBe(
			"stopped",
		)
	})

	it("runs its own tools for an older CLI, and says it is retired", async () => {
		const cli = fakeCli("0.85.0", "exit 70")
		const client = await connect(cli)
		try {
			expect(client.getInstructions()).toContain("lpm mcp setup")
			const { tools } = await client.listTools()
			expect(tools.map(tool => tool.name)).toContain("lpm_package_info")
		} finally {
			await client.close()
		}
		expect(existsSync(path.join(root, "handoff"))).toBe(false)
	})

	it("runs its own tools when a CLI that serves MCP starts it again", async () => {
		const cli = fakeCli(
			"0.86.0",
			[
				`echo started >> "${root}/starts"`,
				`exec "${process.execPath}" "${BIN}"`,
			].join("\n"),
		)
		const client = await connect(cli)
		try {
			const { tools } = await client.listTools()
			expect(tools.map(tool => tool.name)).toContain("lpm_package_info")
		} finally {
			await client.close()
		}
		expect(
			readFileSync(path.join(root, "starts"), "utf8").trim().split("\n"),
		).toEqual(["started"])
	})
})
