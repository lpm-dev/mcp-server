import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryCache } from '../../cache.js'
import { checkName } from '../../tools/check-name.js'

vi.mock('../../api.js', () => ({
	registryGet: vi.fn(),
}))

import { registryGet } from '../../api.js'

function createContext(overrides = {}) {
	return {
		cache: new MemoryCache(),
		getToken: vi.fn().mockResolvedValue('test-token'),
		getBaseUrl: vi.fn().mockReturnValue('https://lpm.dev'),
		...overrides,
	}
}

describe('checkName tool', () => {
	beforeEach(() => {
		registryGet.mockReset()
	})

	it('returns availability for available name', async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { name: '@lpm.dev/alice.new-pkg', available: true, ownerExists: true, ownerType: 'user' },
		})

		const result = await checkName({ name: 'alice.new-pkg' }, createContext())
		const data = JSON.parse(result.content[0].text)

		expect(data.available).toBe(true)
		expect(data.ownerExists).toBe(true)
	})

	it('returns taken status for existing package', async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { name: '@lpm.dev/alice.ui-kit', available: false, ownerExists: true, ownerType: 'user' },
		})

		const result = await checkName({ name: 'alice.ui-kit' }, createContext())
		const data = JSON.parse(result.content[0].text)

		expect(data.available).toBe(false)
	})

	it('returns auth error when no token', async () => {
		const ctx = createContext({ getToken: vi.fn().mockResolvedValue(null) })

		const result = await checkName({ name: 'alice.test' }, ctx)

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('No LPM token')
		expect(registryGet).not.toHaveBeenCalled()
	})

	it('does not cache responses', async () => {
		registryGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: { name: '@lpm.dev/alice.test', available: true, ownerExists: true },
		})
		const ctx = createContext()

		await checkName({ name: 'alice.test' }, ctx)
		await checkName({ name: 'alice.test' }, ctx)

		expect(registryGet).toHaveBeenCalledTimes(2)
	})

	it('returns error for invalid name format', async () => {
		const result = await checkName({ name: 'no-dot' }, createContext())

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('Invalid package name')
	})

	it('handles API errors', async () => {
		registryGet.mockResolvedValueOnce({
			ok: false,
			status: 401,
			data: { error: 'Unauthorized' },
		})

		const result = await checkName({ name: 'alice.test' }, createContext())

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('expired or revoked')
	})
})
