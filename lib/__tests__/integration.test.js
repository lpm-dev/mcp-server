import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryCache } from '../cache.js'

// Mock both API modules and CLI runner
vi.mock('../api.js', () => ({
	searchGet: vi.fn(),
	registryGet: vi.fn(),
}))

vi.mock('../cli.js', () => ({
	runCli: vi.fn(),
}))

import { searchGet, registryGet } from '../api.js'
import { runCli } from '../cli.js'
import { search } from '../tools/search.js'
import { packageInfo } from '../tools/package-info.js'
import { browseSource } from '../tools/browse-source.js'
import { add } from '../tools/add.js'
import { install } from '../tools/install.js'

function createContext(overrides = {}) {
	return {
		cache: new MemoryCache(),
		getToken: vi.fn().mockResolvedValue('lpm_test-token'),
		getBaseUrl: vi.fn().mockReturnValue('https://lpm.dev'),
		...overrides,
	}
}

describe('Integration: AI workflow', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('search → package info → browse source → add (JS package)', async () => {
		const ctx = createContext()

		// Step 1: Search for packages
		searchGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: {
				packages: [
					{
						owner: 'alice',
						name: 'ui-kit',
						description: 'React UI components',
						downloadCount: 5000,
						packageType: 'component',
						ecosystem: 'js',
					},
				],
			},
		})

		const searchResult = await search({ query: 'react ui components' }, ctx)
		expect(searchResult.isError).toBeUndefined()
		expect(searchResult.content[0].text).toContain('alice.ui-kit')
		expect(searchResult.content[0].text).toContain('React UI components')

		// Step 2: Get package info
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: {
				name: '@lpm.dev/alice.ui-kit',
				description: 'React UI components',
				ecosystem: 'js',
				packageType: 'component',
				distributionMode: 'pool',
				'dist-tags': { latest: '2.0.0' },
				versions: {
					'2.0.0': {
						version: '2.0.0',
						dependencies: { react: '^18.0.0' },
						readme: '# UI Kit\nReact components',
					},
				},
				downloads: 5000,
				accessInfo: { model: 'pool', summary: 'Included with Pool subscription' },
			},
		})

		const infoResult = await packageInfo({ name: 'alice.ui-kit' }, ctx)
		expect(infoResult.isError).toBeUndefined()
		const infoData = JSON.parse(infoResult.content[0].text)
		expect(infoData.ecosystem).toBe('js')
		expect(infoData.installMethod.command).toBe('lpm add')
		expect(infoData.hasAccess).toBe(true)
		expect(infoData.distributionMode).toBe('pool')

		// Step 3: Browse source (tree first)
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: {
				package: 'alice.ui-kit',
				version: '2.0.0',
				ecosystem: 'js',
				distributionMode: 'pool',
				tree: ['src/index.js', 'src/button.jsx', 'src/input.jsx', 'package.json'],
				files: [],
				totalSize: 0,
				truncated: false,
			},
		})

		const treeResult = await browseSource({ name: 'alice.ui-kit' }, ctx)
		expect(treeResult.isError).toBeUndefined()
		const treeData = JSON.parse(treeResult.content[0].text)
		expect(treeData.tree).toHaveLength(4)
		expect(treeData.files).toBeUndefined()

		// Step 4: Browse specific directory
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: {
				package: 'alice.ui-kit',
				version: '2.0.0',
				ecosystem: 'js',
				distributionMode: 'pool',
				tree: ['src/index.js', 'src/button.jsx', 'src/input.jsx', 'package.json'],
				files: [
					{ path: 'src/button.jsx', content: 'export function Button() { return <button /> }' },
				],
				totalSize: 47,
				truncated: false,
			},
		})

		const fileResult = await browseSource({ name: 'alice.ui-kit', path: 'src/button.jsx' }, ctx)
		const fileData = JSON.parse(fileResult.content[0].text)
		expect(fileData.files).toHaveLength(1)
		expect(fileData.files[0].content).toContain('Button')

		// Step 5: Add the package
		runCli.mockResolvedValueOnce({
			success: true,
			data: {
				success: true,
				package: { name: '@lpm.dev/alice.ui-kit', version: '2.0.0' },
				files: [
					{ path: 'src/components/ui/button.jsx', action: 'created' },
					{ path: 'src/components/ui/input.jsx', action: 'created' },
				],
				installPath: 'src/components/ui',
			},
			error: null,
		})

		const addResult = await add({ name: 'alice.ui-kit', path: 'src/components/ui' }, ctx)
		expect(addResult.isError).toBeUndefined()
		const addData = JSON.parse(addResult.content[0].text)
		expect(addData.success).toBe(true)
		expect(addData.files).toHaveLength(2)
	})

	it('search → package info → install (JS dependency)', async () => {
		const ctx = createContext()

		// Step 1: Search
		searchGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: {
				packages: [
					{
						owner: 'bob',
						name: 'validate',
						description: 'Input validation library',
						downloadCount: 12000,
						packageType: 'dependency',
						ecosystem: 'js',
					},
				],
			},
		})

		const searchResult = await search({ query: 'validation library' }, ctx)
		expect(searchResult.content[0].text).toContain('bob.validate')
		expect(searchResult.content[0].text).toContain('Input validation library')

		// Step 2: Package info reveals it's a dependency type
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: {
				name: '@lpm.dev/bob.validate',
				description: 'Input validation library',
				ecosystem: 'js',
				packageType: 'dependency',
				distributionMode: 'pool',
				'dist-tags': { latest: '3.1.0' },
				versions: {
					'3.1.0': { version: '3.1.0', dependencies: {} },
				},
				downloads: 12000,
			},
		})

		const infoResult = await packageInfo({ name: 'bob.validate' }, ctx)
		const infoData = JSON.parse(infoResult.content[0].text)
		expect(infoData.installMethod.command).toBe('lpm install')

		// Step 3: Install (not add)
		runCli.mockResolvedValueOnce({
			success: true,
			data: {
				success: true,
				packages: [{ name: '@lpm.dev/bob.validate' }],
				npmOutput: 'added 1 package in 1s',
			},
			error: null,
		})

		const installResult = await install({ name: 'bob.validate' }, ctx)
		expect(installResult.isError).toBeUndefined()
		const installData = JSON.parse(installResult.content[0].text)
		expect(installData.success).toBe(true)
	})

	it('search → package info → browse source (Swift package)', async () => {
		const ctx = createContext()

		// Step 1: Search with ecosystem filter
		searchGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: {
				packages: [
					{
						owner: 'carol',
						name: 'network',
						description: 'Swift networking library',
						downloadCount: 800,
						ecosystem: 'swift',
					},
				],
			},
		})

		const searchResult = await search({ query: 'networking', ecosystem: 'swift' }, ctx)
		expect(searchResult.content[0].text).toContain('carol.network')
		expect(searchResult.content[0].text).toContain('Swift networking library')

		// Step 2: Package info shows swift ecosystem
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: {
				name: '@lpm.dev/carol.network',
				description: 'Swift networking library',
				ecosystem: 'swift',
				packageType: 'package',
				'dist-tags': { latest: '1.0.0' },
				versions: {
					'1.0.0': {
						version: '1.0.0',
						versionMeta: {
							swift: { platforms: ['iOS', 'macOS'], toolsVersion: '5.9' },
						},
					},
				},
				downloads: 800,
			},
		})

		const infoResult = await packageInfo({ name: 'carol.network' }, ctx)
		const infoData = JSON.parse(infoResult.content[0].text)
		expect(infoData.ecosystem).toBe('swift')
		expect(infoData.installMethod.command).toBe('lpm add')
		expect(infoData.swiftPlatforms).toEqual(['iOS', 'macOS'])

		// Step 3: Browse source shows Swift structure
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: {
				package: 'carol.network',
				version: '1.0.0',
				ecosystem: 'swift',
				tree: ['Package.swift', 'Sources/Network/Client.swift', 'Sources/Network/Request.swift'],
				files: [],
				truncated: false,
			},
		})

		const treeResult = await browseSource({ name: 'carol.network' }, ctx)
		const treeData = JSON.parse(treeResult.content[0].text)
		expect(treeData.ecosystem).toBe('swift')
		expect(treeData.tree).toContain('Package.swift')
		expect(treeData.tree).toContain('Sources/Network/Client.swift')
	})

	it('unauthenticated user gets helpful errors', async () => {
		const ctx = createContext({
			getToken: vi.fn().mockResolvedValue(null),
		})

		// browse source requires auth
		const browseResult = await browseSource({ name: 'alice.ui-kit' }, ctx)
		expect(browseResult.isError).toBe(true)
		expect(browseResult.content[0].text).toContain('Authentication required')

		// add requires auth
		const addResult = await add({ name: 'alice.ui-kit' }, ctx)
		expect(addResult.isError).toBe(true)
		expect(addResult.content[0].text).toContain('Authentication required')

		// install requires auth
		const installResult = await install({ name: 'alice.ui-kit' }, ctx)
		expect(installResult.isError).toBe(true)
		expect(installResult.content[0].text).toContain('Authentication required')
	})

	it('pool access denied shows subscription message', async () => {
		const ctx = createContext()

		registryGet.mockResolvedValueOnce({
			ok: false,
			status: 403,
			data: { error: 'Package @lpm.dev/alice.ui-kit is part of Pool. Subscribe to Pool ($12/mo) for access.' },
		})

		const result = await browseSource({ name: 'alice.ui-kit' }, ctx)
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('Pool')
	})

	it('marketplace access denied shows purchase message', async () => {
		const ctx = createContext()

		registryGet.mockResolvedValueOnce({
			ok: false,
			status: 403,
			data: { error: 'Package @lpm.dev/alice.premium requires purchase. Visit the package page to buy access.' },
		})

		const result = await browseSource({ name: 'alice.premium' }, ctx)
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('purchase')
	})
})
