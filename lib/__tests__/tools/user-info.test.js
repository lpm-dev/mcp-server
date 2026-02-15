import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryCache } from '../../cache.js'
import { userInfo } from '../../tools/user-info.js'

vi.mock('../../api.js', () => ({
	registryGet: vi.fn(),
}))

import { registryGet } from '../../api.js'

const MOCK_USER = {
	username: 'alice@example.com',
	profile_username: 'alice',
	organizations: [
		{ slug: 'acme', name: 'Acme Corp', role: 'owner' },
	],
	available_scopes: ['@alice', '@acme'],
	plan_tier: 'pro',
	has_pool_access: true,
	usage: { storage_bytes: 50000000, private_packages: 2 },
	limits: { privatePackages: 10, storageBytes: 524288000 },
}

function createContext(overrides = {}) {
	return {
		cache: new MemoryCache(),
		getToken: vi.fn().mockResolvedValue('test-token'),
		getBaseUrl: vi.fn().mockReturnValue('https://lpm.dev'),
		...overrides,
	}
}

describe('userInfo tool', () => {
	beforeEach(() => {
		registryGet.mockReset()
	})

	it('returns user info with orgs', async () => {
		registryGet.mockResolvedValueOnce({ ok: true, status: 200, data: MOCK_USER })

		const result = await userInfo({}, createContext())
		const data = JSON.parse(result.content[0].text)

		expect(data.profile_username).toBe('alice')
		expect(data.organizations).toHaveLength(1)
		expect(data.plan_tier).toBe('pro')
		expect(data.has_pool_access).toBe(true)
	})

	it('calls whoami endpoint', async () => {
		registryGet.mockResolvedValueOnce({ ok: true, status: 200, data: MOCK_USER })

		await userInfo({}, createContext())

		expect(registryGet).toHaveBeenCalledWith('/-/whoami', 'test-token', 'https://lpm.dev')
	})

	it('returns auth error when no token', async () => {
		const ctx = createContext({ getToken: vi.fn().mockResolvedValue(null) })

		const result = await userInfo({}, ctx)

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('No LPM token')
		expect(registryGet).not.toHaveBeenCalled()
	})

	it('caches results', async () => {
		registryGet.mockResolvedValueOnce({ ok: true, status: 200, data: MOCK_USER })
		const ctx = createContext()

		await userInfo({}, ctx)
		await userInfo({}, ctx)

		expect(registryGet).toHaveBeenCalledTimes(1)
	})

	it('handles 401 error', async () => {
		registryGet.mockResolvedValueOnce({ ok: false, status: 401, data: { error: 'Unauthorized' } })

		const result = await userInfo({}, createContext())

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('expired or revoked')
	})

	it('handles user with no orgs', async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { ...MOCK_USER, organizations: [], available_scopes: ['@alice'] },
		})

		const result = await userInfo({}, createContext())
		const data = JSON.parse(result.content[0].text)

		expect(data.organizations).toHaveLength(0)
	})
})
