import { beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryCache } from "../../cache.js"
import { browseSource } from "../../tools/browse-source.js"

vi.mock("../../api.js", () => ({
	registryGet: vi.fn(),
}))

import { registryGet } from "../../api.js"

const MOCK_TREE_RESPONSE = {
	package: "alice.ui-kit",
	version: "2.0.0",
	ecosystem: "js",
	distributionMode: "pool",
	tree: ["src/index.js", "src/button.jsx", "package.json"],
	files: [],
	totalSize: 0,
	truncated: false,
}

const MOCK_FILES_RESPONSE = {
	package: "alice.ui-kit",
	version: "2.0.0",
	ecosystem: "js",
	distributionMode: "pool",
	tree: ["src/index.js", "src/button.jsx", "package.json"],
	files: [
		{ path: "src/index.js", content: 'export { Button } from "./button"' },
		{ path: "src/button.jsx", content: "export function Button() {}" },
	],
	totalSize: 60,
	truncated: false,
	lpmConfig: { styling: "panda" },
}

function createContext(overrides = {}) {
	return {
		cache: new MemoryCache(),
		getToken: vi.fn().mockResolvedValue("test-token"),
		getBaseUrl: vi.fn().mockReturnValue("https://lpm.dev"),
		...overrides,
	}
}

describe("browseSource tool", () => {
	beforeEach(() => {
		registryGet.mockReset()
	})

	it("returns error for invalid package name", async () => {
		const result = await browseSource({ name: "no-dot-here" }, createContext())
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("Invalid")
	})

	it("returns error when not authenticated", async () => {
		const ctx = createContext({ getToken: vi.fn().mockResolvedValue(null) })
		const result = await browseSource({ name: "alice.ui-kit" }, ctx)
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("Authentication required")
	})

	it("returns file tree when no path specified", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: MOCK_TREE_RESPONSE,
		})

		const result = await browseSource({ name: "alice.ui-kit" }, createContext())
		const data = JSON.parse(result.content[0].text)

		expect(data.package).toBe("alice.ui-kit")
		expect(data.version).toBe("2.0.0")
		expect(data.ecosystem).toBe("js")
		expect(data.tree).toHaveLength(3)
		expect(data.files).toBeUndefined() // No files in tree-only mode
	})

	it("returns tree + file contents when path specified", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: MOCK_FILES_RESPONSE,
		})

		const result = await browseSource(
			{ name: "alice.ui-kit", path: "src" },
			createContext(),
		)
		const data = JSON.parse(result.content[0].text)

		expect(data.tree).toHaveLength(3)
		expect(data.files).toHaveLength(2)
		expect(data.files[0].path).toBe("src/index.js")
		expect(data.lpmConfig).toEqual({ styling: "panda" })
	})

	it("calls registry API with correct URL (no params)", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: MOCK_TREE_RESPONSE,
		})

		await browseSource({ name: "alice.ui-kit" }, createContext())

		expect(registryGet).toHaveBeenCalledWith(
			"/@lpm.dev/alice.ui-kit/source",
			"test-token",
			"https://lpm.dev",
		)
	})

	it("sends path= param when empty string to get all files", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: MOCK_FILES_RESPONSE,
		})

		await browseSource({ name: "alice.ui-kit", path: "" }, createContext())

		expect(registryGet).toHaveBeenCalledWith(
			"/@lpm.dev/alice.ui-kit/source?path=",
			"test-token",
			"https://lpm.dev",
		)
	})

	it("calls registry API with version and path params", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: MOCK_FILES_RESPONSE,
		})

		await browseSource(
			{ name: "alice.ui-kit", version: "1.0.0", path: "src" },
			createContext(),
		)

		expect(registryGet).toHaveBeenCalledWith(
			"/@lpm.dev/alice.ui-kit/source?version=1.0.0&path=src",
			"test-token",
			"https://lpm.dev",
		)
	})

	it("handles @lpm.dev/ prefix in name", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: MOCK_TREE_RESPONSE,
		})

		await browseSource({ name: "@lpm.dev/alice.ui-kit" }, createContext())

		expect(registryGet).toHaveBeenCalledWith(
			"/@lpm.dev/alice.ui-kit/source",
			"test-token",
			"https://lpm.dev",
		)
	})

	it("returns error for 404 (version not found)", async () => {
		registryGet.mockResolvedValueOnce({ ok: false, status: 404, data: {} })

		const result = await browseSource(
			{ name: "alice.ui-kit", version: "99.0.0" },
			createContext(),
		)
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("99.0.0")
		expect(result.content[0].text).toContain("not found")
	})

	it("returns error for 403 with access denied message", async () => {
		registryGet.mockResolvedValueOnce({
			ok: false,
			status: 403,
			data: {
				error:
					"Package @lpm.dev/alice.ui-kit is part of Pool. Subscribe to Pool ($12/mo) for access.",
			},
		})

		const result = await browseSource({ name: "alice.ui-kit" }, createContext())
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("Pool")
	})

	it("returns error for 429 (rate limited)", async () => {
		registryGet.mockResolvedValueOnce({ ok: false, status: 429, data: {} })

		const result = await browseSource({ name: "alice.ui-kit" }, createContext())
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("Rate limit")
	})

	it("returns error for 503 (disabled)", async () => {
		registryGet.mockResolvedValueOnce({ ok: false, status: 503, data: {} })

		const result = await browseSource({ name: "alice.ui-kit" }, createContext())
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("disabled")
	})

	it("includes truncation warning when response is truncated", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { ...MOCK_FILES_RESPONSE, truncated: true },
		})

		const result = await browseSource(
			{ name: "alice.ui-kit", path: "src" },
			createContext(),
		)
		const data = JSON.parse(result.content[0].text)

		expect(data.truncated).toBe(true)
		expect(data.warning).toContain("truncated")
	})

	it("caches responses", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: MOCK_TREE_RESPONSE,
		})
		const ctx = createContext()

		await browseSource({ name: "alice.ui-kit" }, ctx)
		const result = await browseSource({ name: "alice.ui-kit" }, ctx)

		expect(registryGet).toHaveBeenCalledTimes(1)
		const data = JSON.parse(result.content[0].text)
		expect(data.package).toBe("alice.ui-kit")
	})

	it("does not cache different paths", async () => {
		registryGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: MOCK_TREE_RESPONSE,
		})
		const ctx = createContext()

		await browseSource({ name: "alice.ui-kit" }, ctx)
		await browseSource({ name: "alice.ui-kit", path: "src" }, ctx)

		expect(registryGet).toHaveBeenCalledTimes(2)
	})
})
