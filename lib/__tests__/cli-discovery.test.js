import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

vi.mock("node:child_process", () => ({
	execFileSync: vi.fn(),
	execFile: vi.fn(),
}))

import { execFileSync } from "node:child_process"
import { resolveCli } from "../cli.js"

let root
beforeEach(() => {
	root = realpathSync(mkdtempSync(path.join(tmpdir(), "lpm-discovery-")))
	vi.stubEnv("LPM_CLI_PATH", "")
	vi.stubEnv("PATH", root)
	vi.resetAllMocks()
})
afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllEnvs()
	rmSync(root, { recursive: true, force: true })
})

it("finds a Windows native executable directly without a workspace locator", () => {
	const executable = path.join(root, "lpm.exe")
	writeFileSync(executable, "fixture", { mode: 0o755 })
	execFileSync.mockReturnValue(path.join(process.cwd(), "lpm.exe"))
	expect(resolveCli("win32")).toBe(executable)
	expect(execFileSync).not.toHaveBeenCalled()
})

it("finds the native target of a global npm Windows installation", () => {
	const packageRoot = path.join(root, "node_modules", "@lpm-registry")
	const wrapper = path.join(packageRoot, "cli")
	const native = path.join(packageRoot, "cli-win32-x64")
	mkdirSync(path.join(wrapper, "bin"), { recursive: true })
	mkdirSync(native, { recursive: true })
	writeFileSync(path.join(root, "lpm.cmd"), "@echo off\r\n")
	writeFileSync(
		path.join(wrapper, "package.json"),
		JSON.stringify({ name: "@lpm-registry/cli", bin: { lpm: "bin/lpm" } }),
	)
	writeFileSync(path.join(wrapper, "bin", "lpm"), "#!/usr/bin/env node\n")
	writeFileSync(
		path.join(native, "package.json"),
		JSON.stringify({ name: "@lpm-registry/cli-win32-x64" }),
	)
	const executable = path.join(native, "lpm.exe")
	writeFileSync(executable, "fixture", { mode: 0o755 })
	expect(resolveCli("win32")).toBe(executable)
})

it("ignores relative and project-local PATH entries", () => {
	vi.spyOn(process, "cwd").mockReturnValue(root)
	const local = path.join(root, "node_modules", ".bin")
	mkdirSync(local, { recursive: true })
	writeFileSync(path.join(root, "lpm.exe"), "fixture", { mode: 0o755 })
	writeFileSync(path.join(local, "lpm.exe"), "fixture", { mode: 0o755 })
	vi.stubEnv("PATH", ["", ".", root, local].join(path.delimiter))
	execFileSync.mockReturnValue(path.join(root, "lpm.exe"))
	expect(resolveCli("win32")).toBeNull()
	expect(execFileSync).not.toHaveBeenCalled()
})

it("rejects Windows overrides that omit the drive or UNC share", () => {
	vi.stubEnv("LPM_CLI_PATH", "/tools/lpm.exe")
	expect(resolveCli("win32")).toBeNull()
})
