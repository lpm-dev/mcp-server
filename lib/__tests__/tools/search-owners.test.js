import { beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryCache } from "../../cache.js"
import { searchOwners } from "../../tools/search-owners.js"

vi.mock("../../api.js", () => ({
	searchGet: vi.fn(),
}))

import { searchGet } from "../../api.js"

const MOCK_OWNERS = [
	{
		slug: "alice",
		name: "Alice Dev",
		type: "user",
		bio: "Full-stack developer",
	},
	{
		slug: "acme-corp",
		name: "Acme Corp",
		type: "org",
		bio: "Building tools for developers",
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

describe("searchOwners tool", () => {
	beforeEach(() => {
		searchGet.mockReset()
	})

	it("returns formatted owner list", async () => {
		searchGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { owners: MOCK_OWNERS },
		})

		const result = await searchOwners({ query: "alice" }, createContext())

		expect(result.isError).toBeUndefined()
		const text = result.content[0].text
		expect(text).toContain("Found 2 profiles")
		expect(text).toContain("@alice")
		expect(text).toContain("(Alice Dev)")
		expect(text).toContain("[user]")
		expect(text).toContain("Full-stack developer")
		expect(text).toContain("@acme-corp")
		expect(text).toContain("(Acme Corp)")
		expect(text).toContain("[org]")
	})

	it("calls searchGet with correct params", async () => {
		searchGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { owners: MOCK_OWNERS },
		})

		await searchOwners({ query: "alice", limit: 3 }, createContext())

		expect(searchGet).toHaveBeenCalledWith(
			expect.stringContaining("/owners?"),
			"test-token",
			"https://lpm.dev",
		)
		const url = searchGet.mock.calls[0][0]
		expect(url).toContain("q=alice")
		expect(url).toContain("limit=3")
	})

	it("returns error for empty query", async () => {
		const result = await searchOwners({ query: "" }, createContext())

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("required")
		expect(searchGet).not.toHaveBeenCalled()
	})

	it("returns error for null query", async () => {
		const result = await searchOwners({ query: null }, createContext())

		expect(result.isError).toBe(true)
		expect(searchGet).not.toHaveBeenCalled()
	})

	it("clamps limit to max 10", async () => {
		searchGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { owners: [] },
		})

		await searchOwners({ query: "test", limit: 100 }, createContext())

		const url = searchGet.mock.calls[0][0]
		expect(url).toContain("limit=10")
	})

	it("defaults limit to 5", async () => {
		searchGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { owners: [] },
		})

		await searchOwners({ query: "test" }, createContext())

		const url = searchGet.mock.calls[0][0]
		expect(url).toContain("limit=5")
	})

	it("returns message when no owners found", async () => {
		searchGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { owners: [] },
		})

		const result = await searchOwners({ query: "nonexistent" }, createContext())

		expect(result.isError).toBeUndefined()
		expect(result.content[0].text).toContain("No users or organizations found")
		expect(result.content[0].text).toContain("nonexistent")
	})

	it("handles API error response", async () => {
		searchGet.mockResolvedValueOnce({
			ok: false,
			status: 503,
			data: { error: "Service unavailable" },
		})

		const result = await searchOwners({ query: "test" }, createContext())

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("Service unavailable")
	})

	it("caches results", async () => {
		searchGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { owners: MOCK_OWNERS },
		})
		const ctx = createContext()

		await searchOwners({ query: "alice" }, ctx)
		await searchOwners({ query: "alice" }, ctx)

		expect(searchGet).toHaveBeenCalledTimes(1)
	})

	it("uses singular 'profile' for single result", async () => {
		searchGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { owners: [MOCK_OWNERS[0]] },
		})

		const result = await searchOwners({ query: "alice" }, createContext())

		expect(result.content[0].text).toContain("Found 1 profile")
	})

	it("omits name when same as slug", async () => {
		searchGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: {
				owners: [{ slug: "alice", name: "alice", type: "user", bio: null }],
			},
		})

		const result = await searchOwners({ query: "alice" }, createContext())
		const text = result.content[0].text

		expect(text).toContain("@alice")
		expect(text).not.toContain("(alice)")
	})

	it("truncates long bios to 80 chars", async () => {
		const longBio = "A".repeat(200)
		searchGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: {
				owners: [{ slug: "alice", name: null, type: "user", bio: longBio }],
			},
		})

		const result = await searchOwners({ query: "alice" }, createContext())
		const text = result.content[0].text

		// Bio should be truncated to 80 chars
		expect(text).toContain("A".repeat(80))
		expect(text).not.toContain("A".repeat(81))
	})
})
