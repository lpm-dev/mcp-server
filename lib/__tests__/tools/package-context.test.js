import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryCache } from '../../cache.js'
import { packageContext } from '../../tools/package-context.js'

vi.mock('../../api.js', () => ({
	registryGet: vi.fn(),
}))

import { registryGet } from '../../api.js'

const MOCK_PACKAGE = {
	name: '@lpm.dev/alice.ui-kit',
	description: 'A UI component kit',
	'dist-tags': { latest: '2.0.0' },
	versions: {
		'1.0.0': { version: '1.0.0' },
		'2.0.0': {
			version: '2.0.0',
			description: 'A UI component kit',
			dependencies: { react: '^18.0.0' },
			peerDependencies: { 'react-dom': '^18.0.0' },
			license: 'MIT',
			readme: 'Short readme',
		},
	},
	ecosystem: 'js',
	distributionMode: 'pool',
	readme: 'Short readme',
}

const MOCK_API_DOCS = {
	name: '@lpm.dev/alice.ui-kit',
	version: '2.0.0',
	available: true,
	docsStatus: 'extracted',
	apiDocs: {
		version: 1,
		strategy: 'typescript',
		entryPoint: 'dist/index.d.ts',
		modules: [
			{
				path: 'index',
				functions: [{ name: 'createTheme', description: 'Create a theme', signatures: [] }],
			},
		],
		stats: { functionCount: 1, totalExports: 1 },
	},
}

const MOCK_LLM_CONTEXT = {
	name: '@lpm.dev/alice.ui-kit',
	version: '2.0.0',
	available: true,
	llmContextStatus: 'extracted',
	llmContext: {
		version: 1,
		purpose: 'React UI component library',
		quickStart: 'import { Button } from "@lpm.dev/alice.ui-kit"',
		keyExports: [{ name: 'Button', kind: 'component' }],
		commonPatterns: [],
		gotchas: ['Requires React 18+'],
		whenToUse: 'Building React apps',
		whenNotToUse: 'Server-only apps',
	},
}

function ok(data) {
	return { ok: true, status: 200, data }
}

function fail(status, data = {}) {
	return { ok: false, status, data }
}

function createContext(overrides = {}) {
	return {
		cache: new MemoryCache(),
		getToken: vi.fn().mockResolvedValue('test-token'),
		getBaseUrl: vi.fn().mockReturnValue('https://lpm.dev'),
		...overrides,
	}
}

/** Set up mocks for all 3 parallel calls: package-info, api-docs, llm-context */
function mockAllThree(infoRes, docsRes, contextRes) {
	registryGet
		.mockResolvedValueOnce(infoRes)
		.mockResolvedValueOnce(docsRes)
		.mockResolvedValueOnce(contextRes)
}

describe('packageContext tool', () => {
	beforeEach(() => {
		registryGet.mockReset()
	})

	it('returns combined response when all 3 are available', async () => {
		mockAllThree(ok(MOCK_PACKAGE), ok(MOCK_API_DOCS), ok(MOCK_LLM_CONTEXT))

		const result = await packageContext({ name: 'alice.ui-kit' }, createContext())
		const data = JSON.parse(result.content[0].text)

		expect(data.package.name).toBe('@lpm.dev/alice.ui-kit')
		expect(data.package.latestVersion).toBe('2.0.0')
		expect(data.package.license).toBe('MIT')
		expect(data.package.dependencies).toEqual(['react'])
		expect(data.package.peerDependencies).toEqual(['react-dom'])
		expect(data.package.installMethod.command).toBe('lpm add')
		expect(data.package.distributionMode).toBe('pool')
		expect(data.apiDocs.modules).toHaveLength(1)
		expect(data.llmContext.purpose).toBe('React UI component library')
	})

	it('omits apiDocs when api-docs endpoint returns 404', async () => {
		mockAllThree(ok(MOCK_PACKAGE), fail(404), ok(MOCK_LLM_CONTEXT))

		const result = await packageContext({ name: 'alice.ui-kit' }, createContext())
		const data = JSON.parse(result.content[0].text)

		expect(data.package).toBeDefined()
		expect(data.llmContext).toBeDefined()
		expect(data.apiDocs).toBeUndefined()
	})

	it('omits llmContext when llm-context endpoint returns 404', async () => {
		mockAllThree(ok(MOCK_PACKAGE), ok(MOCK_API_DOCS), fail(404))

		const result = await packageContext({ name: 'alice.ui-kit' }, createContext())
		const data = JSON.parse(result.content[0].text)

		expect(data.package).toBeDefined()
		expect(data.apiDocs).toBeDefined()
		expect(data.llmContext).toBeUndefined()
	})

	it('omits apiDocs when available is false', async () => {
		const unavailable = { ...MOCK_API_DOCS, available: false, apiDocs: null }
		mockAllThree(ok(MOCK_PACKAGE), ok(unavailable), ok(MOCK_LLM_CONTEXT))

		const result = await packageContext({ name: 'alice.ui-kit' }, createContext())
		const data = JSON.parse(result.content[0].text)

		expect(data.apiDocs).toBeUndefined()
		expect(data.llmContext).toBeDefined()
	})

	it('omits llmContext when available is false', async () => {
		const unavailable = { ...MOCK_LLM_CONTEXT, available: false, llmContext: null }
		mockAllThree(ok(MOCK_PACKAGE), ok(MOCK_API_DOCS), ok(unavailable))

		const result = await packageContext({ name: 'alice.ui-kit' }, createContext())
		const data = JSON.parse(result.content[0].text)

		expect(data.llmContext).toBeUndefined()
		expect(data.apiDocs).toBeDefined()
	})

	it('returns only package when both docs and context are unavailable', async () => {
		mockAllThree(ok(MOCK_PACKAGE), fail(404), fail(404))

		const result = await packageContext({ name: 'alice.ui-kit' }, createContext())
		const data = JSON.parse(result.content[0].text)

		expect(data.package).toBeDefined()
		expect(data.apiDocs).toBeUndefined()
		expect(data.llmContext).toBeUndefined()
	})

	it('returns error when package-info returns 404', async () => {
		mockAllThree(fail(404), ok(MOCK_API_DOCS), ok(MOCK_LLM_CONTEXT))

		const result = await packageContext({ name: 'alice.missing' }, createContext())

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('not found')
	})

	it('returns error when package-info returns 403', async () => {
		mockAllThree(
			fail(403, { error: 'Access denied' }),
			ok(MOCK_API_DOCS),
			ok(MOCK_LLM_CONTEXT),
		)

		const result = await packageContext({ name: 'alice.private' }, createContext())

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('Access denied')
	})

	it('returns error for invalid name', async () => {
		const result = await packageContext({ name: 'badname' }, createContext())

		expect(result.isError).toBe(true)
	})

	it('caches combined result', async () => {
		mockAllThree(ok(MOCK_PACKAGE), ok(MOCK_API_DOCS), ok(MOCK_LLM_CONTEXT))
		const ctx = createContext()

		await packageContext({ name: 'alice.ui-kit' }, ctx)
		await packageContext({ name: 'alice.ui-kit' }, ctx)

		expect(registryGet).toHaveBeenCalledTimes(3) // 3 calls on first, 0 on second
	})

	it('uses different cache keys for auth vs no-auth', async () => {
		mockAllThree(ok(MOCK_PACKAGE), ok(MOCK_API_DOCS), ok(MOCK_LLM_CONTEXT))
		mockAllThree(ok(MOCK_PACKAGE), ok(MOCK_API_DOCS), ok(MOCK_LLM_CONTEXT))

		const ctx1 = createContext()
		const ctx2 = createContext({ getToken: vi.fn().mockResolvedValue(null) })

		await packageContext({ name: 'alice.ui-kit' }, ctx1)
		await packageContext({ name: 'alice.ui-kit' }, ctx2)

		expect(registryGet).toHaveBeenCalledTimes(6)
	})

	it('uses different cache keys for different versions', async () => {
		mockAllThree(ok(MOCK_PACKAGE), ok(MOCK_API_DOCS), ok(MOCK_LLM_CONTEXT))
		mockAllThree(ok(MOCK_PACKAGE), ok(MOCK_API_DOCS), ok(MOCK_LLM_CONTEXT))
		const ctx = createContext()

		await packageContext({ name: 'alice.ui-kit' }, ctx)
		await packageContext({ name: 'alice.ui-kit', version: '1.0.0' }, ctx)

		expect(registryGet).toHaveBeenCalledTimes(6)
	})

	it('truncates long readme', async () => {
		const longReadme = 'x'.repeat(1000)
		const pkg = {
			...MOCK_PACKAGE,
			readme: longReadme,
		}
		mockAllThree(ok(pkg), ok(MOCK_API_DOCS), ok(MOCK_LLM_CONTEXT))

		const result = await packageContext({ name: 'alice.ui-kit' }, createContext())
		const data = JSON.parse(result.content[0].text)

		expect(data.package.readme.length).toBeLessThan(1000)
		expect(data.package.readme).toContain('truncated')
		expect(data.package.readme).toContain('lpm_package_info')
	})

	it('calls correct endpoints with version', async () => {
		mockAllThree(ok(MOCK_PACKAGE), ok(MOCK_API_DOCS), ok(MOCK_LLM_CONTEXT))

		await packageContext({ name: 'alice.ui-kit', version: '2.0.0' }, createContext())

		expect(registryGet).toHaveBeenCalledTimes(3)
		expect(registryGet).toHaveBeenCalledWith(
			'/@lpm.dev/alice.ui-kit',
			'test-token',
			'https://lpm.dev',
		)
		expect(registryGet).toHaveBeenCalledWith(
			'/api-docs?name=alice.ui-kit&version=2.0.0',
			'test-token',
			'https://lpm.dev',
		)
		expect(registryGet).toHaveBeenCalledWith(
			'/llm-context?name=alice.ui-kit&version=2.0.0',
			'test-token',
			'https://lpm.dev',
		)
	})

	it('handles @lpm.dev/ prefix', async () => {
		mockAllThree(ok(MOCK_PACKAGE), ok(MOCK_API_DOCS), ok(MOCK_LLM_CONTEXT))

		await packageContext({ name: '@lpm.dev/alice.ui-kit' }, createContext())

		expect(registryGet).toHaveBeenCalledWith(
			'/@lpm.dev/alice.ui-kit',
			'test-token',
			'https://lpm.dev',
		)
	})
})
