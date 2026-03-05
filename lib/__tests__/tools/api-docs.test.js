import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryCache } from '../../cache.js'
import { apiDocs } from '../../tools/api-docs.js'

vi.mock('../../api.js', () => ({
	registryGet: vi.fn(),
}))

import { registryGet } from '../../api.js'

const MOCK_API_DOCS = {
	name: '@lpm.dev/alice.ui-kit',
	version: '2.1.0',
	available: true,
	docsStatus: 'extracted',
	apiDocs: {
		version: 1,
		strategy: 'typescript',
		entryPoint: 'dist/index.d.ts',
		modules: [
			{
				path: 'index',
				functions: [
					{
						name: 'createTheme',
						description: 'Create a custom theme',
						signatures: [
							{
								params: [{ name: 'options', type: 'ThemeOptions', optional: true }],
								returnType: 'Theme',
								typeParams: [],
							},
						],
					},
				],
				interfaces: [],
				classes: [],
				typeAliases: [],
				enums: [],
				variables: [],
			},
		],
		stats: { functionCount: 1, classCount: 0, interfaceCount: 0, totalExports: 1 },
	},
	publishedAt: '2025-11-20T14:00:00Z',
}

const MOCK_UNAVAILABLE = {
	name: '@lpm.dev/bob.utils',
	version: '1.0.0',
	available: false,
	docsStatus: 'pending',
	message: 'API docs are being generated. Try again in a few minutes.',
}

function createContext(overrides = {}) {
	return {
		cache: new MemoryCache(),
		getToken: vi.fn().mockResolvedValue('test-token'),
		getBaseUrl: vi.fn().mockReturnValue('https://lpm.dev'),
		...overrides,
	}
}

describe('apiDocs tool', () => {
	beforeEach(() => {
		registryGet.mockReset()
	})

	it('returns full api docs', async () => {
		registryGet.mockResolvedValueOnce({ ok: true, status: 200, data: MOCK_API_DOCS })

		const result = await apiDocs({ name: 'alice.ui-kit' }, createContext())
		const data = JSON.parse(result.content[0].text)

		expect(data.available).toBe(true)
		expect(data.apiDocs.strategy).toBe('typescript')
		expect(data.apiDocs.modules).toHaveLength(1)
		expect(data.apiDocs.modules[0].functions[0].name).toBe('createTheme')
	})

	it('calls correct API endpoint without version', async () => {
		registryGet.mockResolvedValueOnce({ ok: true, status: 200, data: MOCK_API_DOCS })

		await apiDocs({ name: 'alice.ui-kit' }, createContext())

		expect(registryGet).toHaveBeenCalledWith(
			'/api-docs?name=alice.ui-kit',
			'test-token',
			'https://lpm.dev',
		)
	})

	it('calls correct API endpoint with version', async () => {
		registryGet.mockResolvedValueOnce({ ok: true, status: 200, data: MOCK_API_DOCS })

		await apiDocs({ name: 'alice.ui-kit', version: '2.1.0' }, createContext())

		expect(registryGet).toHaveBeenCalledWith(
			'/api-docs?name=alice.ui-kit&version=2.1.0',
			'test-token',
			'https://lpm.dev',
		)
	})

	it('handles @lpm.dev/ prefix', async () => {
		registryGet.mockResolvedValueOnce({ ok: true, status: 200, data: MOCK_API_DOCS })

		await apiDocs({ name: '@lpm.dev/alice.ui-kit' }, createContext())

		expect(registryGet).toHaveBeenCalledWith(
			'/api-docs?name=alice.ui-kit',
			'test-token',
			'https://lpm.dev',
		)
	})

	it('returns helpful message when docs unavailable', async () => {
		registryGet.mockResolvedValueOnce({ ok: true, status: 200, data: MOCK_UNAVAILABLE })

		const result = await apiDocs({ name: 'bob.utils' }, createContext())

		expect(result.isError).toBeUndefined()
		expect(result.content[0].text).toContain('being generated')
		expect(result.content[0].text).toContain('bob.utils')
	})

	it('caches successful results', async () => {
		registryGet.mockResolvedValueOnce({ ok: true, status: 200, data: MOCK_API_DOCS })
		const ctx = createContext()

		await apiDocs({ name: 'alice.ui-kit' }, ctx)
		await apiDocs({ name: 'alice.ui-kit' }, ctx)

		expect(registryGet).toHaveBeenCalledTimes(1)
	})

	it('uses different cache keys for different versions', async () => {
		registryGet.mockResolvedValue({ ok: true, status: 200, data: MOCK_API_DOCS })
		const ctx = createContext()

		await apiDocs({ name: 'alice.ui-kit' }, ctx)
		await apiDocs({ name: 'alice.ui-kit', version: '2.0.0' }, ctx)

		expect(registryGet).toHaveBeenCalledTimes(2)
	})

	it('returns error for invalid name', async () => {
		const result = await apiDocs({ name: 'badname' }, createContext())

		expect(result.isError).toBe(true)
	})

	it('returns error for 404', async () => {
		registryGet.mockResolvedValueOnce({ ok: false, status: 404, data: {} })

		const result = await apiDocs({ name: 'alice.missing' }, createContext())

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('not found')
	})

	it('returns error for 404 with version label', async () => {
		registryGet.mockResolvedValueOnce({ ok: false, status: 404, data: {} })

		const result = await apiDocs({ name: 'alice.missing', version: '9.9.9' }, createContext())

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('alice.missing@9.9.9')
	})

	it('returns error for 403', async () => {
		registryGet.mockResolvedValueOnce({ ok: false, status: 403, data: {} })

		const result = await apiDocs({ name: 'alice.private' }, createContext())

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('Access denied')
	})

	it('passes token from context', async () => {
		registryGet.mockResolvedValueOnce({ ok: true, status: 200, data: MOCK_API_DOCS })
		const ctx = createContext({ getToken: vi.fn().mockResolvedValue(null) })

		await apiDocs({ name: 'alice.ui-kit' }, ctx)

		expect(registryGet).toHaveBeenCalledWith(
			expect.any(String),
			null,
			'https://lpm.dev',
		)
	})
})
