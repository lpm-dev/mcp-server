import { beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryCache } from "../../cache.js"
import { qualityReport } from "../../tools/quality-report.js"

vi.mock("../../api.js", () => ({
	registryGet: vi.fn(),
}))

import { registryGet } from "../../api.js"

const MOCK_QUALITY = {
	name: "@lpm.dev/alice.ui-kit",
	score: 85,
	maxScore: 100,
	tier: "good",
	categories: [
		{ name: "documentation", score: 22, maxScore: 25 },
		{ name: "code", score: 28, maxScore: 30 },
	],
	checks: [
		{ id: "has-readme", passed: true, points: 10, maxPoints: 10 },
		{ id: "has-tests", passed: false, points: 0, maxPoints: 15 },
	],
	publishedAt: "2024-06-15T00:00:00Z",
}

function createContext(overrides = {}) {
	return {
		cache: new MemoryCache(),
		getToken: vi.fn().mockResolvedValue("test-token"),
		getBaseUrl: vi.fn().mockReturnValue("https://lpm.dev"),
		...overrides,
	}
}

describe("qualityReport tool", () => {
	beforeEach(() => {
		registryGet.mockReset()
	})

	it("returns full quality report", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: MOCK_QUALITY,
		})

		const result = await qualityReport(
			{ name: "alice.ui-kit" },
			createContext(),
		)
		const data = JSON.parse(result.content[0].text)

		expect(data.score).toBe(85)
		expect(data.tier).toBe("good")
		expect(data.checks).toHaveLength(2)
	})

	it("calls correct API endpoint", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: MOCK_QUALITY,
		})

		await qualityReport({ name: "alice.ui-kit" }, createContext())

		expect(registryGet).toHaveBeenCalledWith(
			"/quality?name=alice.ui-kit",
			"test-token",
			"https://lpm.dev",
		)
	})

	it("caches results", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: MOCK_QUALITY,
		})
		const ctx = createContext()

		await qualityReport({ name: "alice.ui-kit" }, ctx)
		await qualityReport({ name: "alice.ui-kit" }, ctx)

		expect(registryGet).toHaveBeenCalledTimes(1)
	})

	it("returns error for invalid name", async () => {
		const result = await qualityReport({ name: "badname" }, createContext())

		expect(result.isError).toBe(true)
	})

	it("returns error for 404", async () => {
		registryGet.mockResolvedValueOnce({ ok: false, status: 404, data: {} })

		const result = await qualityReport(
			{ name: "alice.missing" },
			createContext(),
		)

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("not found")
	})

	it("returns error for 403", async () => {
		registryGet.mockResolvedValueOnce({ ok: false, status: 403, data: {} })

		const result = await qualityReport(
			{ name: "alice.private" },
			createContext(),
		)

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("Access denied")
	})
})
