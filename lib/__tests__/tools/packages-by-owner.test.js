import { beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryCache } from "../../cache.js"
import { packagesByOwner } from "../../tools/packages-by-owner.js"

vi.mock("../../api.js", () => ({
	searchGet: vi.fn(),
}))

import { searchGet } from "../../api.js"

const MOCK_PACKAGES = [
	{
		owner: "alice",
		name: "ui-kit",
		description: "A component library",
		downloadCount: 12500,
		distributionMode: "pool",
	},
	{
		owner: "alice",
		name: "utils",
		description: null,
		downloadCount: 0,
		distributionMode: "marketplace",
	},
]

function createContext(overrides = {}) {
	return {
		cache: new MemoryCache(),
		getToken: vi.fn().mockResolvedValue("test-token"),
		getBaseUrl: vi.fn().mockReturnValue("https://lpm.dev"),
		...overrides,
	}
}

describe("packagesByOwner tool", () => {
	beforeEach(() => {
		searchGet.mockReset()
	})

	it("returns formatted package list", async () => {
		searchGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { packages: MOCK_PACKAGES },
		})

		const result = await packagesByOwner({ owner: "alice" }, createContext())

		expect(result.isError).toBeUndefined()
		const text = result.content[0].text
		expect(text).toContain("Found 2 packages by alice")
		expect(text).toContain("alice.ui-kit")
		expect(text).toContain("[pool]")
		expect(text).toContain("A component library")
		expect(text).toContain("12,500 downloads")
		expect(text).toContain("alice.utils")
		expect(text).toContain("[marketplace]")
	})

	it("calls searchGet with correct params", async () => {
		searchGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { packages: MOCK_PACKAGES },
		})

		await packagesByOwner({ owner: "alice", limit: 5 }, createContext())

		expect(searchGet).toHaveBeenCalledWith(
			expect.stringContaining("/packages/by-owner?"),
			"test-token",
			"https://lpm.dev",
		)
		const url = searchGet.mock.calls[0][0]
		expect(url).toContain("owner=alice")
		expect(url).toContain("limit=5")
	})

	it("returns error for empty owner", async () => {
		const result = await packagesByOwner({ owner: "" }, createContext())

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("required")
		expect(searchGet).not.toHaveBeenCalled()
	})

	it("returns error for null owner", async () => {
		const result = await packagesByOwner({ owner: null }, createContext())

		expect(result.isError).toBe(true)
		expect(searchGet).not.toHaveBeenCalled()
	})

	it("strips @ prefix from owner", async () => {
		searchGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { packages: MOCK_PACKAGES },
		})

		await packagesByOwner({ owner: "@alice" }, createContext())

		const url = searchGet.mock.calls[0][0]
		expect(url).toContain("owner=alice")
		expect(url).not.toContain("owner=%40alice")
	})

	it("clamps limit to valid range", async () => {
		searchGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { packages: [] },
		})

		await packagesByOwner({ owner: "alice", limit: 999 }, createContext())

		const url = searchGet.mock.calls[0][0]
		expect(url).toContain("limit=50")
	})

	it("defaults limit to 10", async () => {
		searchGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { packages: [] },
		})

		await packagesByOwner({ owner: "alice" }, createContext())

		const url = searchGet.mock.calls[0][0]
		expect(url).toContain("limit=10")
	})

	it("returns message when no packages found", async () => {
		searchGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { packages: [] },
		})

		const result = await packagesByOwner({ owner: "alice" }, createContext())

		expect(result.isError).toBeUndefined()
		expect(result.content[0].text).toContain("No public packages found")
		expect(result.content[0].text).toContain("alice")
	})

	it("handles API error response", async () => {
		searchGet.mockResolvedValueOnce({
			ok: false,
			status: 500,
			data: { error: "Internal server error" },
		})

		const result = await packagesByOwner({ owner: "alice" }, createContext())

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("Internal server error")
	})

	it("caches results", async () => {
		searchGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { packages: MOCK_PACKAGES },
		})
		const ctx = createContext()

		await packagesByOwner({ owner: "alice" }, ctx)
		await packagesByOwner({ owner: "alice" }, ctx)

		expect(searchGet).toHaveBeenCalledTimes(1)
	})

	it("caches empty results too", async () => {
		searchGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { packages: [] },
		})
		const ctx = createContext()

		await packagesByOwner({ owner: "alice" }, ctx)
		await packagesByOwner({ owner: "alice" }, ctx)

		expect(searchGet).toHaveBeenCalledTimes(1)
	})

	it("uses singular 'package' for single result", async () => {
		searchGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { packages: [MOCK_PACKAGES[0]] },
		})

		const result = await packagesByOwner({ owner: "alice" }, createContext())

		expect(result.content[0].text).toContain("Found 1 package by alice")
	})

	it("handles package without description or downloads", async () => {
		searchGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: {
				packages: [
					{
						owner: "alice",
						name: "bare",
						description: null,
						downloadCount: null,
						distributionMode: null,
					},
				],
			},
		})

		const result = await packagesByOwner({ owner: "alice" }, createContext())
		const text = result.content[0].text

		expect(text).toContain("alice.bare")
		expect(text).not.toContain("downloads")
		expect(text).not.toContain("—")
	})
})
