import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock keytar before imports
vi.mock('keytar', () => ({
	default: {
		getPassword: vi.fn(),
	},
}))

import { getBaseUrl, getToken } from '../auth.js'

describe('auth', () => {
	const originalEnv = process.env

	beforeEach(() => {
		process.env = { ...originalEnv }
		delete process.env.LPM_TOKEN
		delete process.env.LPM_REGISTRY_URL
	})

	afterEach(() => {
		process.env = originalEnv
		vi.restoreAllMocks()
	})

	describe('getToken', () => {
		it('returns LPM_TOKEN env var when set', async () => {
			process.env.LPM_TOKEN = 'lpm_test_token'
			const token = await getToken()
			expect(token).toBe('lpm_test_token')
		})

		it('falls back to keytar when env var not set', async () => {
			const keytar = await import('keytar')
			keytar.default.getPassword.mockResolvedValueOnce('lpm_keychain_token')

			const token = await getToken()
			expect(token).toBe('lpm_keychain_token')
			expect(keytar.default.getPassword).toHaveBeenCalledWith('lpm-cli', 'auth-token')
		})

		it('returns null when keytar has no token', async () => {
			const keytar = await import('keytar')
			keytar.default.getPassword.mockResolvedValueOnce(null)

			const token = await getToken()
			expect(token).toBeNull()
		})

		it('prefers env var over keytar', async () => {
			process.env.LPM_TOKEN = 'lpm_env_token'
			const keytar = await import('keytar')

			const token = await getToken()
			expect(token).toBe('lpm_env_token')
			expect(keytar.default.getPassword).not.toHaveBeenCalled()
		})
	})

	describe('getBaseUrl', () => {
		it('returns LPM_REGISTRY_URL env var when set', () => {
			process.env.LPM_REGISTRY_URL = 'https://custom.registry.dev'
			expect(getBaseUrl()).toBe('https://custom.registry.dev')
		})

		it('returns default URL when env var not set', () => {
			expect(getBaseUrl()).toBe('https://lpm.dev')
		})
	})
})
