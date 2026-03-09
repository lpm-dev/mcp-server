import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("node:child_process", () => ({
	execSync: vi.fn(),
	execFile: vi.fn(),
}))

import { execFile, execSync } from "node:child_process"
import { resolveCli, runCli } from "../cli.js"

describe("resolveCli", () => {
	beforeEach(() => {
		vi.resetAllMocks()
		delete process.env.LPM_CLI_PATH
	})

	it("returns LPM_CLI_PATH env var when set", () => {
		process.env.LPM_CLI_PATH = "/custom/path/lpm"
		expect(resolveCli()).toBe("/custom/path/lpm")
	})

	it("falls back to which lpm", () => {
		execSync.mockReturnValueOnce("/usr/local/bin/lpm\n")
		expect(resolveCli()).toBe("/usr/local/bin/lpm")
	})

	it("returns null when CLI not found", () => {
		execSync.mockImplementation(() => {
			throw new Error("not found")
		})
		expect(resolveCli()).toBeNull()
	})

	it("prefers LPM_CLI_PATH over which", () => {
		process.env.LPM_CLI_PATH = "/override/lpm"
		execSync.mockReturnValueOnce("/usr/local/bin/lpm\n")
		expect(resolveCli()).toBe("/override/lpm")
		expect(execSync).not.toHaveBeenCalled()
	})
})

describe("runCli", () => {
	beforeEach(() => {
		vi.resetAllMocks()
		process.env.LPM_CLI_PATH = "/usr/local/bin/lpm"
	})

	afterEach(() => {
		delete process.env.LPM_CLI_PATH
	})

	it("returns error when CLI not found", async () => {
		delete process.env.LPM_CLI_PATH
		execSync.mockImplementation(() => {
			throw new Error("not found")
		})

		const result = await runCli(["add", "test.pkg"])

		expect(result.success).toBe(false)
		expect(result.error).toContain("LPM CLI not found")
	})

	it("returns parsed JSON on success", async () => {
		const jsonOutput = JSON.stringify({
			success: true,
			package: { name: "test.pkg" },
		})
		execFile.mockImplementation((_cmd, _args, _opts, cb) => {
			cb(null, jsonOutput, "")
		})

		const result = await runCli(["add", "test.pkg", "--json"])

		expect(result.success).toBe(true)
		expect(result.data.package.name).toBe("test.pkg")
	})

	it("returns error on CLI failure with JSON output", async () => {
		const jsonOutput = JSON.stringify({
			success: false,
			errors: ["Package not found"],
		})
		execFile.mockImplementation((_cmd, _args, _opts, cb) => {
			cb(new Error("exit code 1"), jsonOutput, "")
		})

		const result = await runCli(["add", "test.missing", "--json"])

		expect(result.success).toBe(false)
		expect(result.error).toBe("Package not found")
	})

	it("returns error on CLI failure without output", async () => {
		execFile.mockImplementation((_cmd, _args, _opts, cb) => {
			cb(new Error("ENOENT"), "", "command not found")
		})

		const result = await runCli(["add", "test.pkg"])

		expect(result.success).toBe(false)
		expect(result.error).toContain("ENOENT")
	})

	it("handles timeout", async () => {
		const err = new Error("timed out")
		err.killed = true
		execFile.mockImplementation((_cmd, _args, _opts, cb) => {
			cb(err, "", "")
		})

		const result = await runCli(["add", "test.pkg"], { timeout: 5000 })

		expect(result.success).toBe(false)
		expect(result.error).toContain("timed out")
	})

	it("handles non-JSON output", async () => {
		execFile.mockImplementation((_cmd, _args, _opts, cb) => {
			cb(null, "not json at all", "")
		})

		const result = await runCli(["add", "test.pkg"])

		expect(result.success).toBe(false)
		expect(result.error).toBe("not json at all")
	})

	it("passes correct args to execFile", async () => {
		execFile.mockImplementation((_cmd, _args, _opts, cb) => {
			cb(null, JSON.stringify({ success: true }), "")
		})

		await runCli(["add", "@lpm.dev/test.pkg", "--json", "--yes"])

		expect(execFile).toHaveBeenCalledWith(
			"/usr/local/bin/lpm",
			["add", "@lpm.dev/test.pkg", "--json", "--yes"],
			expect.objectContaining({ timeout: 60_000 }),
			expect.any(Function),
		)
	})
})
