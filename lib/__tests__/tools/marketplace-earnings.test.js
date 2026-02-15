import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryCache } from '../../cache.js'
import { marketplaceEarnings } from '../../tools/marketplace-earnings.js'

vi.mock('../../api.js', () => ({
	registryGet: vi.fn(),
}))

import { registryGet } from '../../api.js'

const MOCK_EARNINGS = {
	totalSales: 12,
	grossRevenueCents: 15000,
	platformFeesCents: 1500,
	netRevenueCents: 13500,
}

function createContext(overrides = {}) {
	return {
		cache: new MemoryCache(),
		getToken: vi.fn().mockResolvedValue('test-token'),
		getBaseUrl: vi.fn().mockReturnValue('https://lpm.dev'),
		...overrides,
	}
}

describe('marketplaceEarnings tool', () => {
	beforeEach(() => {
		registryGet.mockReset()
	})

	it('returns earnings data', async () => {
		registryGet.mockResolvedValueOnce({ ok: true, status: 200, data: MOCK_EARNINGS })

		const result = await marketplaceEarnings({}, createContext())
		const data = JSON.parse(result.content[0].text)

		expect(data.totalSales).toBe(12)
		expect(data.netRevenueCents).toBe(13500)
	})

	it('calls correct endpoint', async () => {
		registryGet.mockResolvedValueOnce({ ok: true, status: 200, data: MOCK_EARNINGS })

		await marketplaceEarnings({}, createContext())

		expect(registryGet).toHaveBeenCalledWith('/marketplace/earnings', 'test-token', 'https://lpm.dev')
	})

	it('returns auth error when no token', async () => {
		const ctx = createContext({ getToken: vi.fn().mockResolvedValue(null) })

		const result = await marketplaceEarnings({}, ctx)

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('No LPM token')
		expect(registryGet).not.toHaveBeenCalled()
	})

	it('caches results', async () => {
		registryGet.mockResolvedValueOnce({ ok: true, status: 200, data: MOCK_EARNINGS })
		const ctx = createContext()

		await marketplaceEarnings({}, ctx)
		await marketplaceEarnings({}, ctx)

		expect(registryGet).toHaveBeenCalledTimes(1)
	})

	it('handles 401 error', async () => {
		registryGet.mockResolvedValueOnce({ ok: false, status: 401, data: { error: 'Unauthorized' } })

		const result = await marketplaceEarnings({}, createContext())

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('expired or revoked')
	})

	it('handles zero sales', async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { totalSales: 0, grossRevenueCents: 0, platformFeesCents: 0, netRevenueCents: 0 },
		})

		const result = await marketplaceEarnings({}, createContext())
		const data = JSON.parse(result.content[0].text)

		expect(data.totalSales).toBe(0)
		expect(result.isError).toBeUndefined()
	})
})
