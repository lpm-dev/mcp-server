import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../cli.js', () => ({
	runCli: vi.fn(),
}))

import { runCli } from '../../cli.js'
import { install } from '../../tools/install.js'

function createContext(overrides = {}) {
	return {
		getToken: vi.fn().mockResolvedValue('test-token'),
		...overrides,
	}
}

describe('install tool', () => {
	beforeEach(() => {
		runCli.mockReset()
	})

	it('returns error for invalid package name', async () => {
		const result = await install({ name: 'no-dot-here' }, createContext())
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('Invalid')
	})

	it('returns error when not authenticated', async () => {
		const ctx = createContext({ getToken: vi.fn().mockResolvedValue(null) })
		const result = await install({ name: 'alice.utils' }, ctx)
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('Authentication required')
	})

	it('returns error when CLI not found', async () => {
		runCli.mockResolvedValueOnce({
			success: false,
			data: null,
			error: 'LPM CLI not found. Install it with: npm install -g @lpm-registry/cli',
		})

		const result = await install({ name: 'alice.utils' }, createContext())
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('CLI not found')
	})

	it('returns structured result on success', async () => {
		runCli.mockResolvedValueOnce({
			success: true,
			data: {
				success: true,
				packages: [{ name: '@lpm.dev/alice.utils' }],
				npmOutput: 'added 1 package in 2s',
			},
			error: null,
		})

		const result = await install({ name: 'alice.utils' }, createContext())
		expect(result.isError).toBeUndefined()
		const data = JSON.parse(result.content[0].text)
		expect(data.success).toBe(true)
		expect(data.packages[0].name).toBe('@lpm.dev/alice.utils')
		expect(data.npmOutput).toContain('added 1 package')
	})

	it('passes correct args to CLI', async () => {
		runCli.mockResolvedValueOnce({
			success: true,
			data: { success: true, packages: [], npmOutput: '' },
			error: null,
		})

		await install({ name: 'alice.utils', version: '3.0.0' }, createContext())

		expect(runCli).toHaveBeenCalledWith([
			'install',
			'@lpm.dev/alice.utils@3.0.0',
			'--json',
		])
	})

	it('handles @lpm.dev/ prefix in name', async () => {
		runCli.mockResolvedValueOnce({
			success: true,
			data: { success: true, packages: [], npmOutput: '' },
			error: null,
		})

		await install({ name: '@lpm.dev/alice.utils' }, createContext())

		expect(runCli).toHaveBeenCalledWith([
			'install',
			'@lpm.dev/alice.utils',
			'--json',
		])
	})

	it('returns CLI error message on failure', async () => {
		runCli.mockResolvedValueOnce({
			success: false,
			data: null,
			error: 'npm install failed with code 1',
		})

		const result = await install({ name: 'alice.utils' }, createContext())
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('npm install failed')
	})

	it('includes warnings in response', async () => {
		runCli.mockResolvedValueOnce({
			success: true,
			data: {
				success: true,
				packages: [{ name: '@lpm.dev/alice.utils' }],
				npmOutput: '',
				warnings: ['Peer dependency warning'],
			},
			error: null,
		})

		const result = await install({ name: 'alice.utils' }, createContext())
		const data = JSON.parse(result.content[0].text)
		expect(data.warnings).toContain('Peer dependency warning')
	})

	it('works without version param', async () => {
		runCli.mockResolvedValueOnce({
			success: true,
			data: { success: true, packages: [], npmOutput: '' },
			error: null,
		})

		await install({ name: 'alice.utils' }, createContext())

		expect(runCli).toHaveBeenCalledWith([
			'install',
			'@lpm.dev/alice.utils',
			'--json',
		])
	})
})
