import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryCache } from '../../cache.js'
import { search } from '../../tools/search.js'

vi.mock('../../api.js', () => ({
	searchGet: vi.fn(),
}))

const { searchGet } = await import('../../api.js')

function makeContext() {
	return {
		cache: new MemoryCache(),
		getToken: vi.fn().mockResolvedValue('test-token'),
		getBaseUrl: vi.fn().mockReturnValue('https://lpm.dev'),
	}
}

describe('search', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('returns error for empty query', async () => {
		const ctx = makeContext()
		const result = await search({ query: '' }, ctx)
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toMatch(/at least 2 characters/)
	})

	it('returns error for single-character query', async () => {
		const ctx = makeContext()
		const result = await search({ query: 'a' }, ctx)
		expect(result.isError).toBe(true)
	})

	it('returns results for valid query', async () => {
		searchGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: {
				packages: [
					{
						name: 'is-number',
						owner: 'tolgaergin',
						username: 'tolgaergin',
						description: 'Check if a value is a number',
						downloadCount: 1500,
					},
				],
			},
		})

		const ctx = makeContext()
		const result = await search({ query: 'number validation' }, ctx)

		expect(result.isError).toBeUndefined()
		expect(result.content[0].text).toContain('Found 1 package')
		expect(result.content[0].text).toContain('tolgaergin.is-number')
		expect(result.content[0].text).toContain('Check if a value is a number')
		expect(result.content[0].text).toContain('1,500 downloads')

		expect(searchGet).toHaveBeenCalledWith(
			expect.stringContaining('mode=semantic'),
			'test-token',
			'https://lpm.dev',
		)
	})

	it('returns no-results message when empty', async () => {
		searchGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: { packages: [] },
		})

		const ctx = makeContext()
		const result = await search({ query: 'nonexistent-package' }, ctx)

		expect(result.isError).toBeUndefined()
		expect(result.content[0].text).toContain('No packages found')
	})

	it('caches results', async () => {
		searchGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: {
				packages: [
					{ name: 'pkg', owner: 'user', username: 'user' },
				],
			},
		})

		const ctx = makeContext()

		await search({ query: 'test query' }, ctx)
		await search({ query: 'test query' }, ctx)

		expect(searchGet).toHaveBeenCalledTimes(1)
	})

	it('handles API errors gracefully', async () => {
		searchGet.mockResolvedValue({
			ok: false,
			status: 500,
			data: { error: 'Internal server error' },
		})

		const ctx = makeContext()
		const result = await search({ query: 'test query' }, ctx)

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('Internal server error')
	})

	it('respects limit parameter', async () => {
		searchGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: { packages: [] },
		})

		const ctx = makeContext()
		await search({ query: 'test', limit: 5 }, ctx)

		expect(searchGet).toHaveBeenCalledWith(
			expect.stringContaining('limit=5'),
			'test-token',
			'https://lpm.dev',
		)
	})

	it('clamps limit to valid range', async () => {
		searchGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: { packages: [] },
		})

		const ctx = makeContext()
		await search({ query: 'test', limit: 100 }, ctx)

		expect(searchGet).toHaveBeenCalledWith(
			expect.stringContaining('limit=20'),
			'test-token',
			'https://lpm.dev',
		)
	})

	it('uses orgSlug when available', async () => {
		searchGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: {
				packages: [
					{
						name: 'utils',
						owner: 'org-id',
						orgSlug: 'myorg',
						description: 'Org utilities',
					},
				],
			},
		})

		const ctx = makeContext()
		const result = await search({ query: 'org utils' }, ctx)

		expect(result.content[0].text).toContain('myorg.utils')
	})
})
