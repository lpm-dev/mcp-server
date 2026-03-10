import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
}))

import { existsSync, readFileSync } from "node:fs"
import { resolveInstalledVersion } from "../resolve-version.js"

describe("resolveInstalledVersion", () => {
	beforeEach(() => {
		existsSync.mockReset()
		readFileSync.mockReset()
	})

	it("returns version from dependencies", () => {
		existsSync.mockReturnValueOnce(true)
		readFileSync.mockReturnValueOnce(
			JSON.stringify({
				dependencies: {
					"@lpm.dev/alice.ui-kit": "^2.1.0",
				},
			}),
		)

		const result = resolveInstalledVersion("alice.ui-kit", "/project")
		expect(result).toBe("2.1.0")
	})

	it("returns version from devDependencies", () => {
		existsSync.mockReturnValueOnce(true)
		readFileSync.mockReturnValueOnce(
			JSON.stringify({
				devDependencies: {
					"@lpm.dev/bob.utils": "1.0.0",
				},
			}),
		)

		const result = resolveInstalledVersion("bob.utils", "/project")
		expect(result).toBe("1.0.0")
	})

	it("strips ^ prefix from version", () => {
		existsSync.mockReturnValueOnce(true)
		readFileSync.mockReturnValueOnce(
			JSON.stringify({
				dependencies: {
					"@lpm.dev/alice.ui-kit": "^1.2.3",
				},
			}),
		)

		const result = resolveInstalledVersion("alice.ui-kit", "/project")
		expect(result).toBe("1.2.3")
	})

	it("strips ~ prefix from version", () => {
		existsSync.mockReturnValueOnce(true)
		readFileSync.mockReturnValueOnce(
			JSON.stringify({
				dependencies: {
					"@lpm.dev/alice.ui-kit": "~1.2.3",
				},
			}),
		)

		const result = resolveInstalledVersion("alice.ui-kit", "/project")
		expect(result).toBe("1.2.3")
	})

	it("strips >= prefix from version", () => {
		existsSync.mockReturnValueOnce(true)
		readFileSync.mockReturnValueOnce(
			JSON.stringify({
				dependencies: {
					"@lpm.dev/alice.ui-kit": ">=2.0.0",
				},
			}),
		)

		const result = resolveInstalledVersion("alice.ui-kit", "/project")
		expect(result).toBe("2.0.0")
	})

	it("handles @lpm.dev/ prefix in package name input", () => {
		existsSync.mockReturnValueOnce(true)
		readFileSync.mockReturnValueOnce(
			JSON.stringify({
				dependencies: {
					"@lpm.dev/alice.ui-kit": "3.0.0",
				},
			}),
		)

		const result = resolveInstalledVersion("@lpm.dev/alice.ui-kit", "/project")
		expect(result).toBe("3.0.0")
	})

	it("returns null when package is not in any package.json", () => {
		existsSync.mockReturnValueOnce(true)
		readFileSync.mockReturnValueOnce(
			JSON.stringify({
				dependencies: {
					"@lpm.dev/other.pkg": "1.0.0",
				},
			}),
		)
		// Walk up - no more package.json files
		existsSync.mockReturnValue(false)

		const result = resolveInstalledVersion("alice.ui-kit", "/project/sub")
		expect(result).toBeNull()
	})

	it("returns null when no package.json exists", () => {
		existsSync.mockReturnValue(false)

		const result = resolveInstalledVersion("alice.ui-kit", "/project")
		expect(result).toBeNull()
	})

	it("walks up directory tree to find package.json", () => {
		// First directory: no package.json
		existsSync.mockReturnValueOnce(false)
		// Parent directory: has package.json
		existsSync.mockReturnValueOnce(true)
		readFileSync.mockReturnValueOnce(
			JSON.stringify({
				dependencies: {
					"@lpm.dev/alice.ui-kit": "2.0.0",
				},
			}),
		)

		const result = resolveInstalledVersion(
			"alice.ui-kit",
			"/project/packages/my-app",
		)
		expect(result).toBe("2.0.0")
	})

	it("skips invalid package.json and continues walking", () => {
		// First: has package.json but it's invalid JSON
		existsSync.mockReturnValueOnce(true)
		readFileSync.mockReturnValueOnce("not valid json {{{")
		// Parent: valid package.json
		existsSync.mockReturnValueOnce(true)
		readFileSync.mockReturnValueOnce(
			JSON.stringify({
				dependencies: {
					"@lpm.dev/alice.ui-kit": "1.5.0",
				},
			}),
		)

		const result = resolveInstalledVersion(
			"alice.ui-kit",
			"/project/packages/app",
		)
		expect(result).toBe("1.5.0")
	})

	it("handles package.json with no dependencies", () => {
		existsSync.mockReturnValueOnce(true)
		readFileSync.mockReturnValueOnce(JSON.stringify({ name: "my-app" }))
		existsSync.mockReturnValue(false)

		const result = resolveInstalledVersion("alice.ui-kit", "/project")
		expect(result).toBeNull()
	})

	it("prefers devDependencies version when not in dependencies", () => {
		existsSync.mockReturnValueOnce(true)
		readFileSync.mockReturnValueOnce(
			JSON.stringify({
				dependencies: {},
				devDependencies: {
					"@lpm.dev/alice.ui-kit": "4.0.0",
				},
			}),
		)

		const result = resolveInstalledVersion("alice.ui-kit", "/project")
		expect(result).toBe("4.0.0")
	})

	it("devDependencies overrides dependencies due to spread order", () => {
		existsSync.mockReturnValueOnce(true)
		readFileSync.mockReturnValueOnce(
			JSON.stringify({
				dependencies: {
					"@lpm.dev/alice.ui-kit": "1.0.0",
				},
				devDependencies: {
					"@lpm.dev/alice.ui-kit": "2.0.0",
				},
			}),
		)

		const result = resolveInstalledVersion("alice.ui-kit", "/project")
		// devDependencies is spread second, so it overwrites dependencies
		expect(result).toBe("2.0.0")
	})

	it("limits directory traversal to 10 levels", () => {
		// All return false - no package.json at any level
		existsSync.mockReturnValue(false)

		const result = resolveInstalledVersion(
			"alice.ui-kit",
			"/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o",
		)
		expect(result).toBeNull()
		// Should check at most 10 directories
		expect(existsSync).toHaveBeenCalledTimes(10)
	})
})
