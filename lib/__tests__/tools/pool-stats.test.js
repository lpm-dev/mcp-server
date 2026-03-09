import { beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryCache } from "../../cache.js"
import { poolStats } from "../../tools/pool-stats.js"

vi.mock("../../api.js", () => ({
	registryGet: vi.fn(),
}))

import { registryGet } from "../../api.js"

const MOCK_POOL = {
	billingPeriod: "2026-02",
	totalWeightedDownloads: 5000,
	estimatedEarningsCents: 2450,
	packages: [
		{
			name: "@lpm.dev/alice.my-utils",
			installCount: 120,
			weightedDownloads: 3200,
			sharePercentage: 1.85,
			estimatedEarningsCents: 1800,
		},
	],
}

function createContext(overrides = {}) {
	return {
		cache: new MemoryCache(),
		getToken: vi.fn().mockResolvedValue("test-token"),
		getBaseUrl: vi.fn().mockReturnValue("https://lpm.dev"),
		...overrides,
	}
}

describe("poolStats tool", () => {
	beforeEach(() => {
		registryGet.mockReset()
	})

	it("returns pool earnings data", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: MOCK_POOL,
		})

		const result = await poolStats({}, createContext())
		const data = JSON.parse(result.content[0].text)

		expect(data.billingPeriod).toBe("2026-02")
		expect(data.estimatedEarningsCents).toBe(2450)
		expect(data.packages).toHaveLength(1)
	})

	it("calls correct endpoint", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: MOCK_POOL,
		})

		await poolStats({}, createContext())

		expect(registryGet).toHaveBeenCalledWith(
			"/pool/stats",
			"test-token",
			"https://lpm.dev",
		)
	})

	it("returns auth error when no token", async () => {
		const ctx = createContext({ getToken: vi.fn().mockResolvedValue(null) })

		const result = await poolStats({}, ctx)

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("No LPM token")
	})

	it("caches results", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: MOCK_POOL,
		})
		const ctx = createContext()

		await poolStats({}, ctx)
		await poolStats({}, ctx)

		expect(registryGet).toHaveBeenCalledTimes(1)
	})

	it("handles 401 error", async () => {
		registryGet.mockResolvedValueOnce({
			ok: false,
			status: 401,
			data: { error: "Unauthorized" },
		})

		const result = await poolStats({}, createContext())

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("expired or revoked")
	})

	it("handles empty packages", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { ...MOCK_POOL, packages: [], estimatedEarningsCents: 0 },
		})

		const result = await poolStats({}, createContext())
		const data = JSON.parse(result.content[0].text)

		expect(data.packages).toHaveLength(0)
		expect(result.isError).toBeUndefined()
	})
})
