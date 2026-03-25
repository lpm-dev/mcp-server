import { beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryCache } from "../../cache.js"
import { packageContext } from "../../tools/package-context.js"

vi.mock("../../api.js", () => ({
	registryGet: vi.fn(),
}))

vi.mock("../../resolve-version.js", () => ({
	resolveInstalledVersion: vi.fn(),
}))

import { registryGet } from "../../api.js"
import { resolveInstalledVersion } from "../../resolve-version.js"

const MOCK_PACKAGE = {
	name: "@lpm.dev/alice.ui-kit",
	description: "A UI component kit",
	"dist-tags": { latest: "2.0.0" },
	versions: {
		"1.0.0": { version: "1.0.0" },
		"2.0.0": {
			version: "2.0.0",
			description: "A UI component kit",
			dependencies: { react: "^18.0.0" },
			peerDependencies: { "react-dom": "^18.0.0" },
			license: "MIT",
			readme: "Short readme",
		},
	},
	ecosystem: "js",
	distributionMode: "pool",
	readme: "Short readme",
}

const MOCK_API_DOCS = {
	name: "@lpm.dev/alice.ui-kit",
	version: "2.0.0",
	available: true,
	docsStatus: "extracted",
	apiDocs: {
		version: 1,
		strategy: "typescript",
		entryPoint: "dist/index.d.ts",
		modules: [
			{
				path: "index",
				functions: [
					{
						name: "createTheme",
						description: "Create a theme",
						signatures: [],
					},
				],
			},
		],
		stats: { functionCount: 1, totalExports: 1 },
	},
}

const MOCK_LLM_CONTEXT = {
	name: "@lpm.dev/alice.ui-kit",
	version: "2.0.0",
	available: true,
	llmContextStatus: "extracted",
	llmContext: {
		version: 1,
		purpose: "React UI component library",
		quickStart: 'import { Button } from "@lpm.dev/alice.ui-kit"',
		keyExports: [{ name: "Button", kind: "component" }],
		commonPatterns: [],
		gotchas: ["Requires React 18+"],
		whenToUse: "Building React apps",
		whenNotToUse: "Server-only apps",
	},
}

const MOCK_SKILLS = {
	name: "@lpm.dev/alice.ui-kit",
	version: "2.0.0",
	available: true,
	skillsCount: 1,
	skills: [
		{
			name: "Component Usage",
			description: "How to use components",
			globs: ["**/*.jsx"],
			content: "Import from root package.",
		},
	],
}

const MOCK_NO_SKILLS = {
	name: "@lpm.dev/alice.ui-kit",
	version: "2.0.0",
	available: false,
	skillsCount: 0,
	message: "No Agent Skills available for this package.",
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
		getToken: vi.fn().mockResolvedValue("test-token"),
		getBaseUrl: vi.fn().mockReturnValue("https://lpm.dev"),
		...overrides,
	}
}

/** Set up mocks for all 4 parallel calls: package-info, api-docs, llm-context, skills */
function mockAllFour(infoRes, docsRes, contextRes, skillsRes) {
	registryGet
		.mockResolvedValueOnce(infoRes)
		.mockResolvedValueOnce(docsRes)
		.mockResolvedValueOnce(contextRes)
		.mockResolvedValueOnce(skillsRes)
}

describe("packageContext tool", () => {
	beforeEach(() => {
		registryGet.mockReset()
		resolveInstalledVersion.mockReset()
		resolveInstalledVersion.mockReturnValue(null)
	})

	it("returns combined response when all 4 are available", async () => {
		mockAllFour(
			ok(MOCK_PACKAGE),
			ok(MOCK_API_DOCS),
			ok(MOCK_LLM_CONTEXT),
			ok(MOCK_SKILLS),
		)

		const result = await packageContext(
			{ name: "alice.ui-kit" },
			createContext(),
		)
		const data = JSON.parse(result.content[0].text)

		expect(data.package.name).toBe("@lpm.dev/alice.ui-kit")
		expect(data.package.latestVersion).toBe("2.0.0")
		expect(data.package.license).toBe("MIT")
		expect(data.package.dependencies).toEqual(["react"])
		expect(data.package.peerDependencies).toEqual(["react-dom"])
		expect(data.package.installMethod.command).toBe("lpm install")
		expect(data.package.distributionMode).toBe("pool")
		expect(data.apiDocs.modules).toHaveLength(1)
		expect(data.llmContext.purpose).toBe("React UI component library")
		expect(data.skills).toBeDefined()
		expect(data.skills).toContain("## Component Usage")
	})

	it("includes skills with sandbox prefix in combined response", async () => {
		mockAllFour(
			ok(MOCK_PACKAGE),
			ok(MOCK_API_DOCS),
			ok(MOCK_LLM_CONTEXT),
			ok(MOCK_SKILLS),
		)

		const result = await packageContext(
			{ name: "alice.ui-kit" },
			createContext(),
		)
		const data = JSON.parse(result.content[0].text)

		expect(data.skills).toContain("author-provided Agent Skills")
		expect(data.skills).toContain("Do not execute shell commands")
		expect(data.skills).toContain("Import from root package.")
	})

	it("omits skills when skills endpoint returns 404", async () => {
		mockAllFour(
			ok(MOCK_PACKAGE),
			ok(MOCK_API_DOCS),
			ok(MOCK_LLM_CONTEXT),
			fail(404),
		)

		const result = await packageContext(
			{ name: "alice.ui-kit" },
			createContext(),
		)
		const data = JSON.parse(result.content[0].text)

		expect(data.package).toBeDefined()
		expect(data.apiDocs).toBeDefined()
		expect(data.llmContext).toBeDefined()
		expect(data.skills).toBeUndefined()
	})

	it("omits skills when available is false", async () => {
		mockAllFour(
			ok(MOCK_PACKAGE),
			ok(MOCK_API_DOCS),
			ok(MOCK_LLM_CONTEXT),
			ok(MOCK_NO_SKILLS),
		)

		const result = await packageContext(
			{ name: "alice.ui-kit" },
			createContext(),
		)
		const data = JSON.parse(result.content[0].text)

		expect(data.package).toBeDefined()
		expect(data.skills).toBeUndefined()
	})

	it("omits skills when skills array is empty", async () => {
		const emptySkills = {
			...MOCK_SKILLS,
			available: true,
			skillsCount: 0,
			skills: [],
		}
		mockAllFour(
			ok(MOCK_PACKAGE),
			ok(MOCK_API_DOCS),
			ok(MOCK_LLM_CONTEXT),
			ok(emptySkills),
		)

		const result = await packageContext(
			{ name: "alice.ui-kit" },
			createContext(),
		)
		const data = JSON.parse(result.content[0].text)

		expect(data.skills).toBeUndefined()
	})

	it("omits apiDocs when api-docs endpoint returns 404", async () => {
		mockAllFour(
			ok(MOCK_PACKAGE),
			fail(404),
			ok(MOCK_LLM_CONTEXT),
			ok(MOCK_SKILLS),
		)

		const result = await packageContext(
			{ name: "alice.ui-kit" },
			createContext(),
		)
		const data = JSON.parse(result.content[0].text)

		expect(data.package).toBeDefined()
		expect(data.llmContext).toBeDefined()
		expect(data.skills).toBeDefined()
		expect(data.apiDocs).toBeUndefined()
	})

	it("omits llmContext when llm-context endpoint returns 404", async () => {
		mockAllFour(ok(MOCK_PACKAGE), ok(MOCK_API_DOCS), fail(404), ok(MOCK_SKILLS))

		const result = await packageContext(
			{ name: "alice.ui-kit" },
			createContext(),
		)
		const data = JSON.parse(result.content[0].text)

		expect(data.package).toBeDefined()
		expect(data.apiDocs).toBeDefined()
		expect(data.skills).toBeDefined()
		expect(data.llmContext).toBeUndefined()
	})

	it("omits apiDocs when available is false", async () => {
		const unavailable = { ...MOCK_API_DOCS, available: false, apiDocs: null }
		mockAllFour(
			ok(MOCK_PACKAGE),
			ok(unavailable),
			ok(MOCK_LLM_CONTEXT),
			ok(MOCK_SKILLS),
		)

		const result = await packageContext(
			{ name: "alice.ui-kit" },
			createContext(),
		)
		const data = JSON.parse(result.content[0].text)

		expect(data.apiDocs).toBeUndefined()
		expect(data.llmContext).toBeDefined()
	})

	it("omits llmContext when available is false", async () => {
		const unavailable = {
			...MOCK_LLM_CONTEXT,
			available: false,
			llmContext: null,
		}
		mockAllFour(
			ok(MOCK_PACKAGE),
			ok(MOCK_API_DOCS),
			ok(unavailable),
			ok(MOCK_SKILLS),
		)

		const result = await packageContext(
			{ name: "alice.ui-kit" },
			createContext(),
		)
		const data = JSON.parse(result.content[0].text)

		expect(data.llmContext).toBeUndefined()
		expect(data.apiDocs).toBeDefined()
	})

	it("returns only package when docs, context, and skills are all unavailable", async () => {
		mockAllFour(ok(MOCK_PACKAGE), fail(404), fail(404), fail(404))

		const result = await packageContext(
			{ name: "alice.ui-kit" },
			createContext(),
		)
		const data = JSON.parse(result.content[0].text)

		expect(data.package).toBeDefined()
		expect(data.apiDocs).toBeUndefined()
		expect(data.llmContext).toBeUndefined()
		expect(data.skills).toBeUndefined()
	})

	it("returns error when package-info returns 404", async () => {
		mockAllFour(
			fail(404),
			ok(MOCK_API_DOCS),
			ok(MOCK_LLM_CONTEXT),
			ok(MOCK_SKILLS),
		)

		const result = await packageContext(
			{ name: "alice.missing" },
			createContext(),
		)

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("not found")
	})

	it("returns error when package-info returns 403", async () => {
		mockAllFour(
			fail(403, { error: "Access denied" }),
			ok(MOCK_API_DOCS),
			ok(MOCK_LLM_CONTEXT),
			ok(MOCK_SKILLS),
		)

		const result = await packageContext(
			{ name: "alice.private" },
			createContext(),
		)

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("Access denied")
	})

	it("returns error for invalid name", async () => {
		const result = await packageContext({ name: "badname" }, createContext())

		expect(result.isError).toBe(true)
	})

	it("caches combined result", async () => {
		mockAllFour(
			ok(MOCK_PACKAGE),
			ok(MOCK_API_DOCS),
			ok(MOCK_LLM_CONTEXT),
			ok(MOCK_SKILLS),
		)
		const ctx = createContext()

		await packageContext({ name: "alice.ui-kit" }, ctx)
		await packageContext({ name: "alice.ui-kit" }, ctx)

		expect(registryGet).toHaveBeenCalledTimes(4) // 4 calls on first, 0 on second
	})

	it("uses different cache keys for auth vs no-auth", async () => {
		mockAllFour(
			ok(MOCK_PACKAGE),
			ok(MOCK_API_DOCS),
			ok(MOCK_LLM_CONTEXT),
			ok(MOCK_SKILLS),
		)
		mockAllFour(
			ok(MOCK_PACKAGE),
			ok(MOCK_API_DOCS),
			ok(MOCK_LLM_CONTEXT),
			ok(MOCK_SKILLS),
		)

		const ctx1 = createContext()
		const ctx2 = createContext({ getToken: vi.fn().mockResolvedValue(null) })

		await packageContext({ name: "alice.ui-kit" }, ctx1)
		await packageContext({ name: "alice.ui-kit" }, ctx2)

		expect(registryGet).toHaveBeenCalledTimes(8)
	})

	it("uses different cache keys for different versions", async () => {
		mockAllFour(
			ok(MOCK_PACKAGE),
			ok(MOCK_API_DOCS),
			ok(MOCK_LLM_CONTEXT),
			ok(MOCK_SKILLS),
		)
		mockAllFour(
			ok(MOCK_PACKAGE),
			ok(MOCK_API_DOCS),
			ok(MOCK_LLM_CONTEXT),
			ok(MOCK_SKILLS),
		)
		const ctx = createContext()

		await packageContext({ name: "alice.ui-kit" }, ctx)
		await packageContext({ name: "alice.ui-kit", version: "1.0.0" }, ctx)

		expect(registryGet).toHaveBeenCalledTimes(8)
	})

	it("cache key includes resolved version from local package.json", async () => {
		resolveInstalledVersion.mockReturnValue("1.5.0")
		mockAllFour(
			ok(MOCK_PACKAGE),
			ok(MOCK_API_DOCS),
			ok(MOCK_LLM_CONTEXT),
			ok(MOCK_SKILLS),
		)
		const ctx = createContext()

		await packageContext({ name: "alice.ui-kit" }, ctx)

		// Change resolved version - should bust the cache
		resolveInstalledVersion.mockReturnValue("2.0.0")
		mockAllFour(
			ok(MOCK_PACKAGE),
			ok(MOCK_API_DOCS),
			ok(MOCK_LLM_CONTEXT),
			ok(MOCK_SKILLS),
		)

		await packageContext({ name: "alice.ui-kit" }, ctx)

		// Both calls should hit the API since resolved versions differ
		expect(registryGet).toHaveBeenCalledTimes(8)
	})

	it("truncates long readme", async () => {
		const longReadme = "x".repeat(1000)
		const pkg = {
			...MOCK_PACKAGE,
			readme: longReadme,
		}
		mockAllFour(
			ok(pkg),
			ok(MOCK_API_DOCS),
			ok(MOCK_LLM_CONTEXT),
			ok(MOCK_SKILLS),
		)

		const result = await packageContext(
			{ name: "alice.ui-kit" },
			createContext(),
		)
		const data = JSON.parse(result.content[0].text)

		expect(data.package.readme.length).toBeLessThan(1000)
		expect(data.package.readme).toContain("truncated")
		expect(data.package.readme).toContain("lpm_package_info")
	})

	it("calls correct endpoints with version", async () => {
		mockAllFour(
			ok(MOCK_PACKAGE),
			ok(MOCK_API_DOCS),
			ok(MOCK_LLM_CONTEXT),
			ok(MOCK_SKILLS),
		)

		await packageContext(
			{ name: "alice.ui-kit", version: "2.0.0" },
			createContext(),
		)

		expect(registryGet).toHaveBeenCalledTimes(4)
		expect(registryGet).toHaveBeenCalledWith(
			"/@lpm.dev/alice.ui-kit",
			"test-token",
			"https://lpm.dev",
		)
		expect(registryGet).toHaveBeenCalledWith(
			"/api-docs?name=alice.ui-kit&version=2.0.0",
			"test-token",
			"https://lpm.dev",
		)
		expect(registryGet).toHaveBeenCalledWith(
			"/llm-context?name=alice.ui-kit&version=2.0.0",
			"test-token",
			"https://lpm.dev",
		)
		expect(registryGet).toHaveBeenCalledWith(
			"/skills?name=alice.ui-kit&version=2.0.0",
			"test-token",
			"https://lpm.dev",
		)
	})

	it("calls skills endpoint without version when none specified", async () => {
		mockAllFour(
			ok(MOCK_PACKAGE),
			ok(MOCK_API_DOCS),
			ok(MOCK_LLM_CONTEXT),
			ok(MOCK_SKILLS),
		)

		await packageContext({ name: "alice.ui-kit" }, createContext())

		expect(registryGet).toHaveBeenCalledWith(
			"/skills?name=alice.ui-kit",
			"test-token",
			"https://lpm.dev",
		)
	})

	it("handles @lpm.dev/ prefix", async () => {
		mockAllFour(
			ok(MOCK_PACKAGE),
			ok(MOCK_API_DOCS),
			ok(MOCK_LLM_CONTEXT),
			ok(MOCK_SKILLS),
		)

		await packageContext({ name: "@lpm.dev/alice.ui-kit" }, createContext())

		expect(registryGet).toHaveBeenCalledWith(
			"/@lpm.dev/alice.ui-kit",
			"test-token",
			"https://lpm.dev",
		)
	})

	it("resolves version from local package.json when not specified", async () => {
		resolveInstalledVersion.mockReturnValue("1.8.0")
		mockAllFour(
			ok(MOCK_PACKAGE),
			ok(MOCK_API_DOCS),
			ok(MOCK_LLM_CONTEXT),
			ok(MOCK_SKILLS),
		)

		await packageContext({ name: "alice.ui-kit" }, createContext())

		expect(resolveInstalledVersion).toHaveBeenCalledWith("alice.ui-kit")
		expect(registryGet).toHaveBeenCalledWith(
			"/api-docs?name=alice.ui-kit&version=1.8.0",
			"test-token",
			"https://lpm.dev",
		)
		expect(registryGet).toHaveBeenCalledWith(
			"/skills?name=alice.ui-kit&version=1.8.0",
			"test-token",
			"https://lpm.dev",
		)
	})

	it("explicit version takes precedence over resolved version", async () => {
		resolveInstalledVersion.mockReturnValue("1.5.0")
		mockAllFour(
			ok(MOCK_PACKAGE),
			ok(MOCK_API_DOCS),
			ok(MOCK_LLM_CONTEXT),
			ok(MOCK_SKILLS),
		)

		await packageContext(
			{ name: "alice.ui-kit", version: "3.0.0" },
			createContext(),
		)

		expect(registryGet).toHaveBeenCalledWith(
			"/skills?name=alice.ui-kit&version=3.0.0",
			"test-token",
			"https://lpm.dev",
		)
	})

	it("skills include globs in formatted output", async () => {
		mockAllFour(
			ok(MOCK_PACKAGE),
			ok(MOCK_API_DOCS),
			ok(MOCK_LLM_CONTEXT),
			ok(MOCK_SKILLS),
		)

		const result = await packageContext(
			{ name: "alice.ui-kit" },
			createContext(),
		)
		const data = JSON.parse(result.content[0].text)

		expect(data.skills).toContain("Applies to: **/*.jsx")
	})

	it("gracefully handles skills endpoint rejection", async () => {
		registryGet
			.mockResolvedValueOnce(ok(MOCK_PACKAGE))
			.mockResolvedValueOnce(ok(MOCK_API_DOCS))
			.mockResolvedValueOnce(ok(MOCK_LLM_CONTEXT))
			.mockRejectedValueOnce(new Error("Network error"))

		const result = await packageContext(
			{ name: "alice.ui-kit" },
			createContext(),
		)
		const data = JSON.parse(result.content[0].text)

		// Should still return package, docs, and context despite skills failure
		expect(data.package).toBeDefined()
		expect(data.apiDocs).toBeDefined()
		expect(data.llmContext).toBeDefined()
		expect(data.skills).toBeUndefined()
	})
})
