import { beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryCache } from "../../cache.js"
import { docs } from "../../tools/docs.js"

vi.mock("../../api.js", () => ({
	textGet: vi.fn(),
}))

import { textGet } from "../../api.js"

const INDEX = [
	"# LPM docs",
	"getting-started — Getting started with LPM",
	"cli/install — Installing packages",
	"cli/publish — Publishing packages",
].join("\n")

const ok = text => ({ ok: true, status: 200, text })

function context() {
	return { cache: new MemoryCache() }
}

describe("docs tool", () => {
	beforeEach(() => {
		textGet.mockReset()
	})

	it("returns a page and caches it", async () => {
		textGet.mockResolvedValueOnce(ok("# Installing"))
		const ctx = context()

		const first = await docs({ page: "/cli/install/" }, ctx)
		const second = await docs({ page: "cli/install" }, ctx)

		expect(first.content[0].text).toBe("# Installing")
		expect(second).toBe(first)
		expect(textGet).toHaveBeenCalledTimes(1)
		expect(textGet).toHaveBeenCalledWith("https://lpm.dev/api/docs/cli/install")
	})

	it("says a missing page wasn't found, and why another page couldn't be read", async () => {
		textGet.mockResolvedValueOnce({ ok: false, status: 404 })
		const missing = await docs({ page: "nope" }, context())
		expect(missing.isError).toBe(true)
		expect(missing.content[0].text).toContain('"nope" not found')

		textGet.mockResolvedValueOnce({
			ok: false,
			status: 0,
			error: "Request timed out",
		})
		const timedOut = await docs({ page: "cli/install" }, context())
		expect(timedOut.isError).toBe(true)
		expect(timedOut.content[0].text).toContain("Request timed out")
	})

	it("returns the index without a page or query", async () => {
		textGet.mockResolvedValueOnce(ok(INDEX))

		const result = await docs({}, context())

		expect(result.content[0].text).toBe(INDEX)
	})

	it("returns the pages whose index lines match a query", async () => {
		textGet
			.mockResolvedValueOnce(ok(INDEX))
			.mockResolvedValueOnce(ok("# Installing"))
			.mockResolvedValueOnce(ok("# Publishing"))

		const result = await docs({ query: "packages" }, context())

		expect(result.content[0].text).toBe(
			"--- cli/install ---\n# Installing\n\n--- cli/publish ---\n# Publishing",
		)
	})

	it("keeps the pages it could read, and names the ones it couldn't", async () => {
		textGet
			.mockResolvedValueOnce(ok(INDEX))
			.mockResolvedValueOnce({
				ok: false,
				status: 0,
				error: "Request timed out",
			})
			.mockResolvedValueOnce(ok("# Publishing"))

		const result = await docs({ query: "packages" }, context())

		expect(result.isError).toBeUndefined()
		expect(result.content[0].text).toBe(
			"--- cli/publish ---\n# Publishing\n\n(Could not read: cli/install: Request timed out)",
		)
	})

	it("reports an error, not an empty answer, when no matching page could be read", async () => {
		textGet
			.mockResolvedValueOnce(ok(INDEX))
			.mockResolvedValueOnce({
				ok: false,
				status: 0,
				error: "Request timed out",
			})
			.mockResolvedValueOnce({ ok: false, status: 503 })

		const result = await docs({ query: "packages" }, context())

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain(
			"cli/install: Request timed out, cli/publish: 503",
		)
	})

	it("reports when the index can't be read", async () => {
		textGet.mockResolvedValueOnce({
			ok: false,
			status: 0,
			error: "Response was larger than 50 MB",
		})

		const result = await docs({ query: "x" }, context())

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain("larger than 50 MB")
	})
})
