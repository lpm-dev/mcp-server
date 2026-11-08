import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { apiGet, registryGet, textGet } from "../api.js"
import { MAX_RESPONSE_BYTES, REQUEST_TIMEOUT_MS } from "../constants.js"

const mockFetch = vi.fn()

describe("api", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", mockFetch)
		mockFetch.mockReset()
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	function jsonResponse(body, status = 200) {
		return {
			ok: status >= 200 && status < 300,
			status,
			json: () => Promise.resolve(body),
			headers: { get: () => null },
		}
	}

	describe("apiGet", () => {
		it("sends GET request to the correct URL", async () => {
			mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))

			await apiGet("https://lpm.dev/api/test", null)

			expect(mockFetch).toHaveBeenCalledWith(
				"https://lpm.dev/api/test",
				expect.objectContaining({ method: "GET" }),
			)
		})

		it("includes Authorization header when token provided", async () => {
			mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))

			await apiGet("https://lpm.dev/api/test", "lpm_mytoken")

			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: "Bearer lpm_mytoken",
					}),
				}),
			)
		})

		it("omits Authorization header when no token", async () => {
			mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))

			await apiGet("https://lpm.dev/api/test", null)

			const headers = mockFetch.mock.calls[0][1].headers
			expect(headers.Authorization).toBeUndefined()
		})

		it("returns parsed JSON data on success", async () => {
			mockFetch.mockResolvedValueOnce(jsonResponse({ name: "test" }))

			const result = await apiGet("https://lpm.dev/api/test", null)

			expect(result.ok).toBe(true)
			expect(result.status).toBe(200)
			expect(result.data.name).toBe("test")
		})

		it("does not retry on 401", async () => {
			mockFetch.mockResolvedValueOnce(
				jsonResponse({ error: "Unauthorized" }, 401),
			)

			const result = await apiGet("https://lpm.dev/api/test", "bad-token")

			expect(mockFetch).toHaveBeenCalledTimes(1)
			expect(result.ok).toBe(false)
			expect(result.status).toBe(401)
		})

		it("does not retry on 403", async () => {
			mockFetch.mockResolvedValueOnce(jsonResponse({ error: "Forbidden" }, 403))

			const result = await apiGet("https://lpm.dev/api/test", "token")

			expect(mockFetch).toHaveBeenCalledTimes(1)
			expect(result.ok).toBe(false)
			expect(result.status).toBe(403)
		})

		it("retries on 500 with backoff", async () => {
			mockFetch
				.mockResolvedValueOnce(jsonResponse({ error: "Server error" }, 500))
				.mockResolvedValueOnce(jsonResponse({ ok: true }))

			const result = await apiGet("https://lpm.dev/api/test", null)

			expect(mockFetch).toHaveBeenCalledTimes(2)
			expect(result.ok).toBe(true)
		})

		it("handles 429 rate limiting", async () => {
			mockFetch
				.mockResolvedValueOnce({
					ok: false,
					status: 429,
					json: () => Promise.resolve({ error: "Rate limited" }),
					headers: { get: h => (h === "Retry-After" ? "1" : null) },
				})
				.mockResolvedValueOnce(jsonResponse({ ok: true }))

			const result = await apiGet("https://lpm.dev/api/test", null)

			expect(mockFetch).toHaveBeenCalledTimes(2)
			expect(result.ok).toBe(true)
		})

		it("returns error on network failure after retries", async () => {
			mockFetch.mockRejectedValue(new Error("fetch failed"))

			const result = await apiGet("https://lpm.dev/api/test", null)

			expect(result.ok).toBe(false)
			expect(result.data.error).toBe("fetch failed")
		})
	})

	describe("response bodies", () => {
		function endlessBody(onCancel) {
			const chunk = new TextEncoder().encode(`"${"x".repeat(64 * 1024)}",`)
			return new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode("["))
				},
				pull(controller) {
					controller.enqueue(chunk)
				},
				cancel: onCancel,
			})
		}

		function stalledBody(signal) {
			return new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode('{"versions":{'))
					signal.addEventListener("abort", () =>
						controller.error(signal.reason),
					)
				},
			})
		}

		afterEach(() => {
			vi.useRealTimers()
		})

		it("stops reading a body past the size limit and reports it without retrying", async () => {
			let cancelled = 0
			mockFetch.mockImplementation(
				async () => new Response(endlessBody(() => cancelled++)),
			)

			const result = await apiGet("https://lpm.dev/api/test", null)

			expect(mockFetch).toHaveBeenCalledTimes(1)
			expect(cancelled).toBe(1)
			expect(result.ok).toBe(false)
			expect(result.data.error).toMatch(/larger than 10 MB/)
		})

		it("doesn't read a body whose declared size is past the limit", async () => {
			let cancelled = 0
			mockFetch.mockImplementation(
				async () =>
					new Response(
						endlessBody(() => cancelled++),
						{
							headers: { "content-length": String(MAX_RESPONSE_BYTES + 1) },
						},
					),
			)

			const result = await apiGet("https://lpm.dev/api/test", null)

			expect(cancelled).toBe(1)
			expect(result.data.error).toMatch(/larger than 10 MB/)
		})

		it("keeps the timeout running until the body has been read", async () => {
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
			mockFetch.mockImplementation(
				async (_url, init) => new Response(stalledBody(init.signal)),
			)

			const pending = apiGet("https://lpm.dev/api/test", null)
			await vi.advanceTimersByTimeAsync((REQUEST_TIMEOUT_MS + 10_000) * 3)
			const result = await pending

			expect(mockFetch).toHaveBeenCalledTimes(3)
			expect(result).toEqual({
				ok: false,
				status: 0,
				data: { error: "Request timed out" },
			})
		})

		it("reads text bodies within the same limit and timeout", async () => {
			mockFetch.mockImplementationOnce(
				async () => new Response("# Docs\n", { status: 200 }),
			)
			expect(await textGet("https://lpm.dev/api/docs")).toEqual({
				ok: true,
				status: 200,
				text: "# Docs\n",
			})

			mockFetch.mockImplementationOnce(async () => new Response(endlessBody()))
			const oversized = await textGet("https://lpm.dev/api/docs")
			expect(oversized.ok).toBe(false)
			expect(oversized.error).toMatch(/larger than 10 MB/)

			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
			mockFetch.mockImplementationOnce(
				async (_url, init) => new Response(stalledBody(init.signal)),
			)
			const pending = textGet("https://lpm.dev/api/docs")
			await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1)
			expect(await pending).toEqual({
				ok: false,
				status: 0,
				error: "Request timed out",
			})
		})
	})

	describe("registryGet", () => {
		it("prepends /api/registry to the path", async () => {
			mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))

			await registryGet("/-/whoami", "token", "https://lpm.dev")

			expect(mockFetch).toHaveBeenCalledWith(
				"https://lpm.dev/api/registry/-/whoami",
				expect.anything(),
			)
		})

		it("passes token through", async () => {
			mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }))

			await registryGet("/test", "lpm_abc", "https://lpm.dev")

			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: "Bearer lpm_abc",
					}),
				}),
			)
		})
	})
})
