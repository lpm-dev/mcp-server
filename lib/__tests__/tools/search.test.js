import { beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryCache } from "../../cache.js"
import { search } from "../../tools/search.js"

vi.mock("../../api.js", () => ({
	searchGet: vi.fn(),
}))

const { searchGet } = await import("../../api.js")

function makeContext(overrides = {}) {
	return {
		cache: new MemoryCache(),
		getToken: vi.fn().mockResolvedValue("test-token"),
		getBaseUrl: vi.fn().mockReturnValue("https://lpm.dev"),
		...overrides,
	}
}

const SEMANTIC_PACKAGE = {
	name: "is-number",
	owner: "tolgaergin",
	ownerSlug: "tolgaergin",
	description: "Check if a value is a number",
	downloadCount: 1500,
	distributionMode: "pool",
	packageType: "package",
	ecosystem: "js",
}

const EXPLORE_PACKAGE = {
	name: "ui-kit",
	owner: "alice",
	description: "Beautiful UI components",
	downloadCount: 5000,
	distributionMode: "marketplace",
	packageType: "source",
	ecosystem: "js",
	qualityScore: 88,
	category: "ui-components",
	tags: ["react", "components"],
}

describe("search — validation", () => {
	beforeEach(() => vi.clearAllMocks())

	it("returns error when neither query nor category provided", async () => {
		const result = await search({}, makeContext())
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("query")
		expect(result.content[0].text).toContain("category")
	})

	it("returns error for single-character query", async () => {
		const result = await search({ query: "a" }, makeContext())
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("2 characters")
	})

	it("returns error for whitespace-only query", async () => {
		const result = await search({ query: "  " }, makeContext())
		expect(result.isError).toBe(true)
	})

	it("allows category without query", async () => {
		searchGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: { packages: [EXPLORE_PACKAGE] },
		})

		const result = await search({ category: "ui-components" }, makeContext())
		expect(result.isError).toBeUndefined()
		expect(result.content[0].text).toContain("alice.ui-kit")
	})
})

describe("search — semantic path (no structured filters)", () => {
	beforeEach(() => vi.clearAllMocks())

	it("uses semantic endpoint for query-only search", async () => {
		searchGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: { packages: [SEMANTIC_PACKAGE] },
		})

		const result = await search({ query: "number validation" }, makeContext())

		expect(result.content[0].text).toContain("Found 1 package")
		expect(result.content[0].text).toContain("tolgaergin.is-number")
		expect(result.content[0].text).toContain("(pool)")
		expect(result.content[0].text).toContain("1,500 downloads")
		expect(searchGet).toHaveBeenCalledWith(
			expect.stringContaining("mode=semantic"),
			"test-token",
			"https://lpm.dev",
		)
	})

	it("passes ecosystem to semantic endpoint", async () => {
		searchGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: { packages: [] },
		})

		await search({ query: "networking", ecosystem: "swift" }, makeContext())

		expect(searchGet).toHaveBeenCalledWith(
			expect.stringContaining("ecosystem=swift"),
			"test-token",
			"https://lpm.dev",
		)
		// Still semantic path (ecosystem alone is not a structured filter)
		expect(searchGet).toHaveBeenCalledWith(
			expect.stringContaining("mode=semantic"),
			"test-token",
			"https://lpm.dev",
		)
	})

	it("clamps limit to 20 for semantic path", async () => {
		searchGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: { packages: [] },
		})

		await search({ query: "test", limit: 100 }, makeContext())

		expect(searchGet).toHaveBeenCalledWith(
			expect.stringContaining("limit=20"),
			"test-token",
			"https://lpm.dev",
		)
	})

	it("returns no-results message", async () => {
		searchGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: { packages: [] },
		})

		const result = await search({ query: "nonexistent-xyz" }, makeContext())
		expect(result.content[0].text).toContain("No packages found")
		expect(result.content[0].text).toContain("nonexistent-xyz")
	})

	it("shows type badge for non-package types", async () => {
		searchGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: {
				packages: [
					{
						...SEMANTIC_PACKAGE,
						packageType: "mcp-server",
					},
				],
			},
		})

		const result = await search({ query: "mcp" }, makeContext())
		expect(result.content[0].text).toContain("[mcp-server]")
	})

	it("shows ecosystem badge for non-js packages", async () => {
		searchGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: {
				packages: [
					{
						...SEMANTIC_PACKAGE,
						ecosystem: "swift",
					},
				],
			},
		})

		const result = await search({ query: "swift" }, makeContext())
		expect(result.content[0].text).toContain("{swift}")
	})

	it("uses ownerSlug when available", async () => {
		searchGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: {
				packages: [
					{
						name: "utils",
						owner: "org-id",
						ownerSlug: "myorg",
						description: "Org utilities",
					},
				],
			},
		})

		const result = await search({ query: "org utils" }, makeContext())
		expect(result.content[0].text).toContain("myorg.utils")
	})
})

describe("search — explore path (structured filters)", () => {
	beforeEach(() => vi.clearAllMocks())

	it("uses explore endpoint when category is provided", async () => {
		searchGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: { packages: [EXPLORE_PACKAGE] },
		})

		await search({ category: "ui-components" }, makeContext())

		expect(searchGet).toHaveBeenCalledWith(
			expect.stringContaining("/packages/explore"),
			"test-token",
			"https://lpm.dev",
		)
	})

	it("uses explore endpoint when distribution is provided", async () => {
		searchGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: { packages: [] },
		})

		await search({ query: "react", distribution: "pool" }, makeContext())

		expect(searchGet).toHaveBeenCalledWith(
			expect.stringContaining("/packages/explore"),
			"test-token",
			"https://lpm.dev",
		)
		expect(searchGet).toHaveBeenCalledWith(
			expect.stringContaining("distribution=pool"),
			"test-token",
			"https://lpm.dev",
		)
	})

	it("passes all structured filters to explore endpoint", async () => {
		searchGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: { packages: [] },
		})

		await search(
			{
				query: "utils",
				category: "tools",
				ecosystem: "js",
				distribution: "marketplace",
				packageType: "package",
				sort: "popular",
				hasTypes: true,
				moduleType: "esm",
				license: "MIT",
				minNodeVersion: "18",
				limit: 25,
			},
			makeContext(),
		)

		const url = searchGet.mock.calls[0][0]
		expect(url).toContain("/packages/explore")
		expect(url).toContain("q=utils")
		expect(url).toContain("category=tools")
		expect(url).toContain("ecosystem=js")
		expect(url).toContain("distribution=marketplace")
		expect(url).toContain("packageType=package")
		expect(url).toContain("sort=popular")
		expect(url).toContain("hasTypes=true")
		expect(url).toContain("moduleType=esm")
		expect(url).toContain("license=MIT")
		expect(url).toContain("minNodeVersion=18")
		expect(url).toContain("limit=25")
	})

	it("allows limit up to 50 for explore path", async () => {
		searchGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: { packages: [] },
		})

		await search({ query: "test", category: "tools", limit: 50 }, makeContext())

		expect(searchGet).toHaveBeenCalledWith(
			expect.stringContaining("limit=50"),
			"test-token",
			"https://lpm.dev",
		)
	})

	it("shows quality score, category, and tags from explore results", async () => {
		searchGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: { packages: [EXPLORE_PACKAGE] },
		})

		const result = await search({ category: "ui-components" }, makeContext())
		const text = result.content[0].text

		expect(text).toContain("(marketplace)")
		expect(text).toContain("[source]")
		expect(text).toContain("Quality: 88")
		expect(text).toContain("Category: ui-components")
		expect(text).toContain("Tags: react, components")
	})

	it("supports private distribution filter", async () => {
		searchGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: {
				packages: [
					{
						name: "internal-lib",
						owner: "tolgaergin",
						ownerSlug: "tolgaergin",
						description: "Internal utilities",
						downloadCount: 50,
						distributionMode: "private",
						packageType: "package",
						ecosystem: "js",
					},
				],
			},
		})

		const result = await search(
			{
				query: "internal",
				distribution: "private",
			},
			makeContext(),
		)

		expect(result.content[0].text).toContain("(private)")
		expect(searchGet).toHaveBeenCalledWith(
			expect.stringContaining("distribution=private"),
			"test-token",
			"https://lpm.dev",
		)
	})
})

describe("search — caching", () => {
	beforeEach(() => vi.clearAllMocks())

	it("caches successful results", async () => {
		searchGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: { packages: [SEMANTIC_PACKAGE] },
		})

		const ctx = makeContext()
		await search({ query: "test query" }, ctx)
		await search({ query: "test query" }, ctx)

		expect(searchGet).toHaveBeenCalledTimes(1)
	})

	it("does not cache errors", async () => {
		searchGet.mockResolvedValue({
			ok: false,
			status: 500,
			data: { error: "Server error" },
		})

		const ctx = makeContext()
		await search({ query: "test query" }, ctx)
		await search({ query: "test query" }, ctx)

		expect(searchGet).toHaveBeenCalledTimes(2)
	})

	it("uses different cache keys for different filters", async () => {
		searchGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: { packages: [] },
		})

		const ctx = makeContext()
		await search({ query: "test" }, ctx)
		await search({ query: "test", distribution: "pool" }, ctx)

		expect(searchGet).toHaveBeenCalledTimes(2)
	})
})

describe("search — error handling", () => {
	beforeEach(() => vi.clearAllMocks())

	it("handles API errors gracefully", async () => {
		searchGet.mockResolvedValue({
			ok: false,
			status: 500,
			data: { error: "Internal server error" },
		})

		const result = await search({ query: "test query" }, makeContext())
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("Internal server error")
	})

	it("handles explore API errors", async () => {
		searchGet.mockResolvedValue({
			ok: false,
			status: 500,
			data: { error: "Explore failed" },
		})

		const result = await search(
			{ query: "test", category: "tools" },
			makeContext(),
		)
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("Explore failed")
	})
})
