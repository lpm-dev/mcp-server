import { beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryCache } from "../../cache.js"
import { llmContext } from "../../tools/llm-context.js"

vi.mock("../../api.js", () => ({
	registryGet: vi.fn(),
}))

import { registryGet } from "../../api.js"

const MOCK_LLM_CONTEXT = {
	name: "@lpm.dev/alice.ui-kit",
	version: "2.1.0",
	available: true,
	llmContextStatus: "extracted",
	llmContext: {
		version: 1,
		purpose: "React UI component library with theme support",
		quickStart:
			'import { Button } from "@lpm.dev/alice.ui-kit"\n\n<Button>Click</Button>',
		keyExports: [
			{
				name: "Button",
				kind: "component",
				signature: "(props: ButtonProps) => JSX.Element",
				description: "Primary button component",
			},
		],
		commonPatterns: [
			{
				title: "Basic button",
				code: '<Button variant="primary">Save</Button>',
				description: "Use variant prop for different styles",
			},
		],
		gotchas: ["Requires React 18+"],
		whenToUse: "Building React apps with consistent UI",
		whenNotToUse: "Server-only apps without React",
	},
	publishedAt: "2025-11-20T14:00:00Z",
}

const MOCK_UNAVAILABLE = {
	name: "@lpm.dev/bob.utils",
	version: "1.0.0",
	available: false,
	llmContextStatus: "pending",
	message: "LLM context is being generated. Try again in a few minutes.",
}

function createContext(overrides = {}) {
	return {
		cache: new MemoryCache(),
		getToken: vi.fn().mockResolvedValue("test-token"),
		getBaseUrl: vi.fn().mockReturnValue("https://lpm.dev"),
		...overrides,
	}
}

describe("llmContext tool", () => {
	beforeEach(() => {
		registryGet.mockReset()
	})

	it("returns full llm context", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: MOCK_LLM_CONTEXT,
		})

		const result = await llmContext({ name: "alice.ui-kit" }, createContext())
		const data = JSON.parse(result.content[0].text)

		expect(data.available).toBe(true)
		expect(data.llmContext.purpose).toContain("React UI")
		expect(data.llmContext.keyExports).toHaveLength(1)
		expect(data.llmContext.keyExports[0].name).toBe("Button")
	})

	it("calls correct API endpoint without version", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: MOCK_LLM_CONTEXT,
		})

		await llmContext({ name: "alice.ui-kit" }, createContext())

		expect(registryGet).toHaveBeenCalledWith(
			"/llm-context?name=alice.ui-kit",
			"test-token",
			"https://lpm.dev",
		)
	})

	it("calls correct API endpoint with version", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: MOCK_LLM_CONTEXT,
		})

		await llmContext(
			{ name: "alice.ui-kit", version: "2.1.0" },
			createContext(),
		)

		expect(registryGet).toHaveBeenCalledWith(
			"/llm-context?name=alice.ui-kit&version=2.1.0",
			"test-token",
			"https://lpm.dev",
		)
	})

	it("handles @lpm.dev/ prefix", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: MOCK_LLM_CONTEXT,
		})

		await llmContext({ name: "@lpm.dev/alice.ui-kit" }, createContext())

		expect(registryGet).toHaveBeenCalledWith(
			"/llm-context?name=alice.ui-kit",
			"test-token",
			"https://lpm.dev",
		)
	})

	it("returns helpful message when context unavailable", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: MOCK_UNAVAILABLE,
		})

		const result = await llmContext({ name: "bob.utils" }, createContext())

		expect(result.isError).toBeUndefined()
		expect(result.content[0].text).toContain("being generated")
		expect(result.content[0].text).toContain("bob.utils")
	})

	it("caches successful results", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: MOCK_LLM_CONTEXT,
		})
		const ctx = createContext()

		await llmContext({ name: "alice.ui-kit" }, ctx)
		await llmContext({ name: "alice.ui-kit" }, ctx)

		expect(registryGet).toHaveBeenCalledTimes(1)
	})

	it("uses different cache keys for different versions", async () => {
		registryGet.mockResolvedValue({
			ok: true,
			status: 200,
			data: MOCK_LLM_CONTEXT,
		})
		const ctx = createContext()

		await llmContext({ name: "alice.ui-kit" }, ctx)
		await llmContext({ name: "alice.ui-kit", version: "2.0.0" }, ctx)

		expect(registryGet).toHaveBeenCalledTimes(2)
	})

	it("returns error for invalid name", async () => {
		const result = await llmContext({ name: "badname" }, createContext())

		expect(result.isError).toBe(true)
	})

	it("returns error for 404", async () => {
		registryGet.mockResolvedValueOnce({ ok: false, status: 404, data: {} })

		const result = await llmContext({ name: "alice.missing" }, createContext())

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("not found")
	})

	it("returns error for 404 with version label", async () => {
		registryGet.mockResolvedValueOnce({ ok: false, status: 404, data: {} })

		const result = await llmContext(
			{ name: "alice.missing", version: "9.9.9" },
			createContext(),
		)

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("alice.missing@9.9.9")
	})

	it("returns error for 403", async () => {
		registryGet.mockResolvedValueOnce({ ok: false, status: 403, data: {} })

		const result = await llmContext({ name: "alice.private" }, createContext())

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("Access denied")
	})

	it("passes token from context", async () => {
		registryGet.mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: MOCK_LLM_CONTEXT,
		})
		const ctx = createContext({ getToken: vi.fn().mockResolvedValue(null) })

		await llmContext({ name: "alice.ui-kit" }, ctx)

		expect(registryGet).toHaveBeenCalledWith(
			expect.any(String),
			null,
			"https://lpm.dev",
		)
	})
})
