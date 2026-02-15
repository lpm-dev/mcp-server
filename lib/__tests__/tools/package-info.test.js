import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryCache } from '../../cache.js'
import { packageInfo } from '../../tools/package-info.js'

vi.mock('../../api.js', () => ({
	registryGet: vi.fn(),
}))

import { registryGet } from '../../api.js'

const MOCK_PACKAGE = {
	name: '@lpm.dev/alice.ui-kit',
	description: 'A UI component kit',
	'dist-tags': { latest: '2.0.0' },
	versions: {
		'1.0.0': { version: '1.0.0', description: 'v1' },
		'2.0.0': {
			version: '2.0.0',
			description: 'A UI component kit',
			dependencies: { react: '^18.0.0' },
			readme: 'Hello world',
		},
	},
	downloads: 5400,
	createdAt: '2024-01-01T00:00:00Z',
	updatedAt: '2024-06-15T00:00:00Z',
	readme: 'Hello world',
}

function createContext(overrides = {}) {
	return {
		cache: new MemoryCache(),
		getToken: vi.fn().mockResolvedValue('test-token'),
		getBaseUrl: vi.fn().mockReturnValue('https://lpm.dev'),
		...overrides,
	}
}

describe('packageInfo tool', () => {
	beforeEach(() => {
		registryGet.mockReset()
	})

	it('returns formatted package metadata', async () => {
		registryGet.mockResolvedValueOnce({ ok: true, status: 200, data: MOCK_PACKAGE })

		const result = await packageInfo({ name: 'alice.ui-kit' }, createContext())
		const data = JSON.parse(result.content[0].text)

		expect(data.name).toBe('@lpm.dev/alice.ui-kit')
		expect(data.latestVersion).toBe('2.0.0')
		expect(data.totalVersions).toBe(2)
		expect(data.downloads).toBe(5400)
		expect(data.dependencies).toContain('react')
	})

	it('handles @lpm.dev/ prefix format', async () => {
		registryGet.mockResolvedValueOnce({ ok: true, status: 200, data: MOCK_PACKAGE })

		await packageInfo({ name: '@lpm.dev/alice.ui-kit' }, createContext())

		expect(registryGet).toHaveBeenCalledWith(
			'/@lpm.dev/alice.ui-kit',
			'test-token',
			'https://lpm.dev',
		)
	})

	it('returns cached response on second call', async () => {
		registryGet.mockResolvedValueOnce({ ok: true, status: 200, data: MOCK_PACKAGE })
		const ctx = createContext()

		await packageInfo({ name: 'alice.ui-kit' }, ctx)
		const result = await packageInfo({ name: 'alice.ui-kit' }, ctx)

		expect(registryGet).toHaveBeenCalledTimes(1)
		const data = JSON.parse(result.content[0].text)
		expect(data.name).toBe('@lpm.dev/alice.ui-kit')
	})

	it('returns error for invalid name format', async () => {
		const result = await packageInfo({ name: 'no-dot-here' }, createContext())

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('Invalid package name')
	})

	it('returns error for 404', async () => {
		registryGet.mockResolvedValueOnce({ ok: false, status: 404, data: {} })

		const result = await packageInfo({ name: 'alice.missing' }, createContext())

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('not found')
	})

	it('returns error for 403', async () => {
		registryGet.mockResolvedValueOnce({ ok: false, status: 403, data: { error: 'Access denied' } })

		const result = await packageInfo({ name: 'alice.private-pkg' }, createContext())

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('Access denied')
	})

	it('truncates long readmes', async () => {
		const longReadme = 'x'.repeat(2000)
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { ...MOCK_PACKAGE, readme: longReadme },
		})

		const result = await packageInfo({ name: 'alice.ui-kit' }, createContext())
		const data = JSON.parse(result.content[0].text)

		expect(data.readme.length).toBeLessThan(1100)
		expect(data.readme).toContain('[truncated]')
	})

	it('works without auth for public packages', async () => {
		registryGet.mockResolvedValueOnce({ ok: true, status: 200, data: MOCK_PACKAGE })
		const ctx = createContext({ getToken: vi.fn().mockResolvedValue(null) })

		const result = await packageInfo({ name: 'alice.ui-kit' }, ctx)

		expect(result.isError).toBeUndefined()
		expect(registryGet).toHaveBeenCalledWith(
			'/@lpm.dev/alice.ui-kit',
			null,
			'https://lpm.dev',
		)
	})
})
