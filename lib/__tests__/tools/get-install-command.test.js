import { beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryCache } from "../../cache.js"
import { getInstallCommand } from "../../tools/get-install-command.js"

vi.mock("../../api.js", () => ({
	registryGet: vi.fn(),
}))

import { registryGet } from "../../api.js"

function createContext(overrides = {}) {
	return {
		cache: new MemoryCache(),
		getToken: vi.fn().mockResolvedValue("test-token"),
		getBaseUrl: vi.fn().mockReturnValue("https://lpm.dev"),
		...overrides,
	}
}

function mockPackage(overrides = {}) {
	return {
		name: "@lpm.dev/alice.ui-kit",
		ecosystem: "js",
		packageType: "package",
		...overrides,
	}
}

describe("getInstallCommand tool", () => {
	beforeEach(() => {
		registryGet.mockReset()
	})

	it("returns lpm install for plain JS packages", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: mockPackage(),
		})

		const result = await getInstallCommand(
			{ name: "alice.ui-kit" },
			createContext(),
		)
		const data = JSON.parse(result.content[0].text)

		expect(data.command).toBe("lpm install @lpm.dev/alice.ui-kit")
		expect(data.method).toBe("install")
	})

	it("returns lpm add for source packages with lpmSource", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: mockPackage({ lpmSource: "src" }),
		})

		const result = await getInstallCommand(
			{ name: "alice.ui-kit" },
			createContext(),
		)
		const data = JSON.parse(result.content[0].text)

		expect(data.command).toBe("lpm add @lpm.dev/alice.ui-kit")
		expect(data.method).toBe("add")
	})

	it("returns lpm add for packages with lpm.config.json", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: mockPackage({ hasLpmConfig: true }),
		})

		const result = await getInstallCommand(
			{ name: "alice.ui-kit" },
			createContext(),
		)
		const data = JSON.parse(result.content[0].text)

		expect(data.command).toBe("lpm add @lpm.dev/alice.ui-kit")
		expect(data.method).toBe("add")
	})

	it("returns lpm add for non-package types (mcp-server)", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: mockPackage({ packageType: "mcp-server" }),
		})

		const result = await getInstallCommand(
			{ name: "alice.my-mcp" },
			createContext(),
		)
		const data = JSON.parse(result.content[0].text)

		expect(data.command).toBe("lpm add @lpm.dev/alice.my-mcp")
		expect(data.method).toBe("add")
	})

	it("returns lpm add for Swift packages", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: mockPackage({ ecosystem: "swift" }),
		})

		const result = await getInstallCommand(
			{ name: "alice.swift-lib" },
			createContext(),
		)
		const data = JSON.parse(result.content[0].text)

		expect(data.command).toBe("lpm add @lpm.dev/alice.swift-lib")
		expect(data.method).toBe("add")
	})

	it("returns lpm add for xcframework packages", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: mockPackage({ ecosystem: "xcframework" }),
		})

		const result = await getInstallCommand(
			{ name: "alice.my-framework" },
			createContext(),
		)
		const data = JSON.parse(result.content[0].text)

		expect(data.command).toBe("lpm add @lpm.dev/alice.my-framework")
		expect(data.method).toBe("add")
	})

	it("includes version when provided", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: mockPackage(),
		})

		const result = await getInstallCommand(
			{ name: "alice.ui-kit", version: "2.0.0" },
			createContext(),
		)
		const data = JSON.parse(result.content[0].text)

		expect(data.command).toBe("lpm install @lpm.dev/alice.ui-kit@2.0.0")
	})

	it("handles @lpm.dev/ prefix format", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: mockPackage(),
		})

		await getInstallCommand({ name: "@lpm.dev/alice.ui-kit" }, createContext())

		expect(registryGet).toHaveBeenCalledWith(
			"/@lpm.dev/alice.ui-kit",
			"test-token",
			"https://lpm.dev",
		)
	})

	it("returns error for invalid name format", async () => {
		const result = await getInstallCommand(
			{ name: "no-dot-here" },
			createContext(),
		)

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("Invalid package name")
	})

	it("returns error for 404", async () => {
		registryGet.mockResolvedValueOnce({ ok: false, status: 404, data: {} })

		const result = await getInstallCommand(
			{ name: "alice.missing" },
			createContext(),
		)

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("not found")
	})

	it("returns fallback lpm add when API returns non-404 error", async () => {
		registryGet.mockResolvedValueOnce({ ok: false, status: 500, data: {} })

		const result = await getInstallCommand(
			{ name: "alice.ui-kit" },
			createContext(),
		)

		expect(result.isError).toBeUndefined()
		expect(result.content[0].text).toBe("lpm add @lpm.dev/alice.ui-kit")
	})

	it("returns cached response on second call", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: mockPackage(),
		})
		const ctx = createContext()

		await getInstallCommand({ name: "alice.ui-kit" }, ctx)
		const result = await getInstallCommand({ name: "alice.ui-kit" }, ctx)

		expect(registryGet).toHaveBeenCalledTimes(1)
		const data = JSON.parse(result.content[0].text)
		expect(data.command).toBe("lpm install @lpm.dev/alice.ui-kit")
	})

	it("includes explanation in response", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: mockPackage({ hasLpmConfig: true }),
		})

		const result = await getInstallCommand(
			{ name: "alice.ui-kit" },
			createContext(),
		)
		const data = JSON.parse(result.content[0].text)

		expect(data.explanation).toContain("source files")
	})
})
