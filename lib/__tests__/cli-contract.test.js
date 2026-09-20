import { afterEach, beforeEach, expect, it, vi } from "vitest"

vi.mock("node:child_process", () => ({
	execSync: vi.fn(),
	execFileSync: vi.fn(),
	execFile: vi.fn(),
}))

import { execFile } from "node:child_process"
import { runCli } from "../cli.js"
import { add } from "../tools/add.js"
import { audit } from "../tools/audit.js"
import { install } from "../tools/install.js"

beforeEach(() => {
	vi.resetAllMocks()
	vi.stubEnv("LPM_CLI_PATH", "/trusted/lpm")
})
afterEach(() => vi.unstubAllEnvs())

function respond(data, error = null) {
	execFile.mockImplementation((_command, _args, _options, callback) => {
		callback(error, JSON.stringify(data), "")
	})
}

it("audits the requested project directory", async () => {
	respond({ success: true, scanned: 1, packages: [] })
	await audit({ path: "/projects/selected" }, { getToken: async () => "token" })
	expect(execFile.mock.calls[0][2].cwd).toBe("/projects/selected")
})

it("keeps a nonzero process result even when the report completed successfully", async () => {
	respond({ success: true, scanned: 1, total_issues: 1 }, new Error("exit 1"))
	const result = await runCli(["audit", "--json"])
	expect(result.success).toBe(false)
	expect(result.data.total_issues).toBe(1)
})

it.each([
	"token rejected",
	{ message: "token rejected", code: "AUTH" },
])("preserves current structured error messages: %j", async error => {
	respond({ success: false, error, error_code: "auth_required" })
	expect((await runCli(["install", "--json"])).error).toBe("token rejected")
})

it.each([
	[
		add,
		{ name: "owner.source" },
		{
			success: true,
			install_path: "src/ui",
			files_copied: 2,
			files: [],
			dependencies_installed: 1,
		},
	],
	[
		install,
		{ name: "owner.library" },
		{ success: true, installed: 1, total: 3, security_summary: { blocked: 1 } },
	],
	[
		audit,
		{},
		{
			success: true,
			scanned: 3,
			packages_with_issues: 1,
			vulnerabilities: [{ id: "GHSA-fixture" }],
			packages: [],
		},
	],
])("preserves the complete current CLI report for %s", async (tool, args, data) => {
	respond(data)
	const result = await tool(args, { getToken: async () => "token" })
	expect(JSON.parse(result.content[0].text)).toEqual(data)
})

it.each([
	add,
	install,
	audit,
])("lets the CLI decide whether authentication is required for %s", async tool => {
	respond({ success: true, packages: [] })
	const result = await tool(
		{ name: "owner.free" },
		{ getToken: async () => null },
	)
	expect(result.isError).toBeUndefined()
	expect(execFile).toHaveBeenCalled()
})

it("keeps findings in a failed audit tool response", async () => {
	const report = {
		success: true,
		scanned: 1,
		vulnerabilities: [{ id: "GHSA-fixture" }],
		packages: [],
	}
	respond(report, new Error("exit 1"))
	const result = await audit({}, { getToken: async () => "token" })
	expect(result.isError).toBe(true)
	expect(JSON.parse(result.content[0].text)).toEqual(report)
})

it("rejects a relative CLI override before changing to an audit project", async () => {
	vi.stubEnv("LPM_CLI_PATH", "./bin/lpm")
	respond({ success: true })
	const result = await audit({ path: "/projects/untrusted" })
	expect(result.isError).toBe(true)
	expect(execFile).not.toHaveBeenCalled()
})
