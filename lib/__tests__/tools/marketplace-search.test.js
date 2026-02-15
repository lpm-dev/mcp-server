import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryCache } from '../../cache.js'
import { marketplaceSearch } from '../../tools/marketplace-search.js'

vi.mock('../../api.js', () => ({
	registryGet: vi.fn(),
}))

import { registryGet } from '../../api.js'

const MOCK_COMPARABLES = {
	comparables: [
		{
			name: '@lpm.dev/acme.ui-buttons',
			description: 'Button components',
			downloadCount: 5400,
			qualityScore: 88,
			distributionMode: 'marketplace',
			pricing: { planCount: 2, minPriceCents: 999, maxPriceCents: 2999 },
		},
	],
	stats: {
		total: 1,
		priceRange: { minCents: 999, maxCents: 999, medianCents: 999 },
	},
}

function createContext(overrides = {}) {
	return {
		cache: new MemoryCache(),
		getToken: vi.fn().mockResolvedValue(null),
		getBaseUrl: vi.fn().mockReturnValue('https://lpm.dev'),
		...overrides,
	}
}

describe('marketplaceSearch tool', () => {
	beforeEach(() => {
		registryGet.mockReset()
	})

	it('searches by category', async () => {
		registryGet.mockResolvedValueOnce({ ok: true, status: 200, data: MOCK_COMPARABLES })

		const result = await marketplaceSearch({ category: 'ui-components' }, createContext())
		const data = JSON.parse(result.content[0].text)

		expect(data.comparables).toHaveLength(1)
		expect(data.stats.total).toBe(1)
	})

	it('searches by query', async () => {
		registryGet.mockResolvedValueOnce({ ok: true, status: 200, data: MOCK_COMPARABLES })

		await marketplaceSearch({ query: 'buttons' }, createContext())

		expect(registryGet.mock.calls[0][0]).toContain('q=buttons')
	})

	it('searches by both category and query', async () => {
		registryGet.mockResolvedValueOnce({ ok: true, status: 200, data: MOCK_COMPARABLES })

		await marketplaceSearch({ query: 'buttons', category: 'ui' }, createContext())

		const url = registryGet.mock.calls[0][0]
		expect(url).toContain('category=ui')
		expect(url).toContain('q=buttons')
	})

	it('passes limit parameter', async () => {
		registryGet.mockResolvedValueOnce({ ok: true, status: 200, data: MOCK_COMPARABLES })

		await marketplaceSearch({ category: 'ui', limit: 5 }, createContext())

		expect(registryGet.mock.calls[0][0]).toContain('limit=5')
	})

	it('returns error when no params provided', async () => {
		const result = await marketplaceSearch({}, createContext())

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('query')
		expect(registryGet).not.toHaveBeenCalled()
	})

	it('caches results', async () => {
		registryGet.mockResolvedValueOnce({ ok: true, status: 200, data: MOCK_COMPARABLES })
		const ctx = createContext()

		await marketplaceSearch({ category: 'ui' }, ctx)
		await marketplaceSearch({ category: 'ui' }, ctx)

		expect(registryGet).toHaveBeenCalledTimes(1)
	})

	it('uses different cache keys for different params', async () => {
		registryGet.mockResolvedValue({ ok: true, status: 200, data: MOCK_COMPARABLES })
		const ctx = createContext()

		await marketplaceSearch({ category: 'ui' }, ctx)
		await marketplaceSearch({ category: 'tools' }, ctx)

		expect(registryGet).toHaveBeenCalledTimes(2)
	})

	it('works without auth (public data)', async () => {
		registryGet.mockResolvedValueOnce({ ok: true, status: 200, data: MOCK_COMPARABLES })

		const result = await marketplaceSearch({ category: 'ui' }, createContext())

		expect(result.isError).toBeUndefined()
		expect(registryGet).toHaveBeenCalledWith(
			expect.any(String),
			null,
			'https://lpm.dev',
		)
	})
})
