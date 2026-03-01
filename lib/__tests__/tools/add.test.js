import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../cli.js', () => ({
	runCli: vi.fn(),
}))

import { runCli } from '../../cli.js'
import { add } from '../../tools/add.js'

function createContext(overrides = {}) {
	return {
		getToken: vi.fn().mockResolvedValue('test-token'),
		...overrides,
	}
}

describe('add tool', () => {
	beforeEach(() => {
		runCli.mockReset()
	})

	it('returns error for invalid package name', async () => {
		const result = await add({ name: 'no-dot-here' }, createContext())
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('Invalid')
	})

	it('returns error when not authenticated', async () => {
		const ctx = createContext({ getToken: vi.fn().mockResolvedValue(null) })
		const result = await add({ name: 'alice.button' }, ctx)
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('Authentication required')
	})

	it('returns error when CLI not found', async () => {
		runCli.mockResolvedValueOnce({
			success: false,
			data: null,
			error: 'LPM CLI not found. Install it with: npm install -g @lpm-registry/cli',
		})

		const result = await add({ name: 'alice.button' }, createContext())
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('CLI not found')
	})

	it('returns structured result on success', async () => {
		runCli.mockResolvedValueOnce({
			success: true,
			data: {
				success: true,
				package: { name: '@lpm.dev/alice.button', version: '1.0.0', ecosystem: 'js' },
				installPath: '/project/src/components/ui',
				alias: '@/components/ui',
				files: [
					{ src: 'button.tsx', dest: 'src/components/ui/button.tsx', action: 'created' },
				],
				dependencies: { npm: ['react@^18'], lpm: [] },
				config: {},
			},
			error: null,
		})

		const result = await add({ name: 'alice.button' }, createContext())
		expect(result.isError).toBeUndefined()
		const data = JSON.parse(result.content[0].text)
		expect(data.success).toBe(true)
		expect(data.package.name).toBe('@lpm.dev/alice.button')
		expect(data.files).toHaveLength(1)
		expect(data.files[0].dest).toBe('src/components/ui/button.tsx')
	})

	it('passes correct args to CLI', async () => {
		runCli.mockResolvedValueOnce({
			success: true,
			data: { success: true, package: {}, files: [], dependencies: { npm: [], lpm: [] } },
			error: null,
		})

		await add({
			name: 'alice.button',
			version: '2.0.0',
			path: 'src/ui',
			alias: '@/ui',
			force: true,
		}, createContext())

		expect(runCli).toHaveBeenCalledWith([
			'add',
			'@lpm.dev/alice.button@2.0.0',
			'--yes',
			'--json',
			'--path', 'src/ui',
			'--alias', '@/ui',
			'--force',
		])
	})

	it('handles @lpm.dev/ prefix in name', async () => {
		runCli.mockResolvedValueOnce({
			success: true,
			data: { success: true, package: {}, files: [], dependencies: { npm: [], lpm: [] } },
			error: null,
		})

		await add({ name: '@lpm.dev/alice.button' }, createContext())

		expect(runCli).toHaveBeenCalledWith(
			expect.arrayContaining(['@lpm.dev/alice.button']),
		)
	})

	it('passes --target flag for Swift packages', async () => {
		runCli.mockResolvedValueOnce({
			success: true,
			data: { success: true, package: {}, files: [], dependencies: { npm: [], lpm: [] } },
			error: null,
		})

		await add({ name: 'alice.swift-ui', target: 'MyApp' }, createContext())

		expect(runCli).toHaveBeenCalledWith(
			expect.arrayContaining(['--target', 'MyApp']),
		)
	})

	it('passes --no-install-deps when installDeps is false', async () => {
		runCli.mockResolvedValueOnce({
			success: true,
			data: { success: true, package: {}, files: [], dependencies: { npm: [], lpm: [] } },
			error: null,
		})

		await add({ name: 'alice.button', installDeps: false }, createContext())

		expect(runCli).toHaveBeenCalledWith(
			expect.arrayContaining(['--no-install-deps']),
		)
	})

	it('appends config params as inline config', async () => {
		runCli.mockResolvedValueOnce({
			success: true,
			data: { success: true, package: {}, files: [], dependencies: { npm: [], lpm: [] }, config: { styling: 'panda' } },
			error: null,
		})

		await add({
			name: 'alice.dialog',
			config: { styling: 'panda', animation: 'framer' },
		}, createContext())

		const call = runCli.mock.calls[0][0]
		const pkgRef = call[1]
		expect(pkgRef).toContain('?')
		expect(pkgRef).toContain('styling=panda')
		expect(pkgRef).toContain('animation=framer')
	})

	it('returns CLI error message on failure', async () => {
		runCli.mockResolvedValueOnce({
			success: false,
			data: null,
			error: 'Package not found',
		})

		const result = await add({ name: 'alice.missing' }, createContext())
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toBe('Package not found')
	})

	it('includes warnings in response', async () => {
		runCli.mockResolvedValueOnce({
			success: true,
			data: {
				success: true,
				package: {},
				files: [],
				dependencies: { npm: [], lpm: [] },
				warnings: ['File conflict skipped: button.tsx'],
			},
			error: null,
		})

		const result = await add({ name: 'alice.button' }, createContext())
		const data = JSON.parse(result.content[0].text)
		expect(data.warnings).toContain('File conflict skipped: button.tsx')
	})
})
