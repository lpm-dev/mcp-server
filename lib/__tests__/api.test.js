import { Readable } from "node:stream"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { apiGet, registryGet, textGet } from "../api.js"
import {
	MAX_RESPONSE_BYTES,
	REQUEST_TIMEOUT_MS,
	REQUEST_TOTAL_TIMEOUT_MS,
	RETRY_MAX_DELAY_MS,
} from "../constants.js"

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
		const encoder = new TextEncoder()
		const tooLarge = new RegExp(
			`larger than ${MAX_RESPONSE_BYTES / (1024 * 1024)} MB`,
		)

		/** A body that never ends, and counts how often it was read and cancelled. */
		function endlessBody() {
			const chunk = encoder.encode(`"${"x".repeat(256 * 1024)}",`)
			const stats = { pulls: 0, cancels: 0 }
			const body = new ReadableStream({
				start(controller) {
					controller.enqueue(encoder.encode("["))
				},
				pull(controller) {
					stats.pulls++
					controller.enqueue(chunk)
				},
				cancel() {
					stats.cancels++
				},
			})
			return { body, stats }
		}

		/** A body that sends `parts`, one every `everyMs`, then ends. */
		function slowBody(parts, everyMs, signal) {
			return new ReadableStream({
				async start(controller) {
					signal?.addEventListener("abort", () =>
						controller.error(signal.reason),
					)
					for (const part of parts) {
						await new Promise(resolve => setTimeout(resolve, everyMs))
						if (signal?.aborted) return
						controller.enqueue(encoder.encode(part))
					}
					controller.close()
				},
			})
		}

		/** A body that sends `part` and then neither ends nor sends more. */
		function stalledBody(part, signal) {
			return new ReadableStream({
				start(controller) {
					controller.enqueue(encoder.encode(part))
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
			const { body, stats } = endlessBody()
			mockFetch.mockImplementation(async () => new Response(body))

			const result = await apiGet("https://lpm.dev/api/test", null)

			expect(mockFetch).toHaveBeenCalledTimes(1)
			expect(stats.cancels).toBe(1)
			expect(result.ok).toBe(false)
			expect(result.data.error).toMatch(tooLarge)
		})

		it("doesn't read a body whose declared size is past the limit", async () => {
			const { body, stats } = endlessBody()
			mockFetch.mockImplementation(
				async () =>
					new Response(body, {
						headers: { "content-length": String(MAX_RESPONSE_BYTES + 1) },
					}),
			)

			const result = await apiGet("https://lpm.dev/api/test", null)

			expect(stats.pulls).toBe(0)
			expect(stats.cancels).toBe(1)
			expect(result.data.error).toMatch(tooLarge)
		})

		it("bounds a body without a stream reader, as fetch replacements give", async () => {
			function* endless() {
				yield Buffer.from("[")
				for (;;) yield Buffer.alloc(256 * 1024, 0x20)
			}
			const body = Readable.from(endless())
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				body,
				headers: { get: () => null },
				json: () => Promise.reject(new Error("must not parse unbounded")),
			})

			const result = await apiGet("https://lpm.dev/api/test", null)

			expect(result.data.error).toMatch(tooLarge)
			expect(body.destroyed).toBe(true)
		})

		it("times out a body that stalls after its headers, on each attempt", async () => {
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
			mockFetch.mockImplementation(
				async (_url, init) =>
					new Response(stalledBody('{"versions":{', init.signal)),
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

		it("lets a slow download finish while it keeps arriving", async () => {
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
			const gap = REQUEST_TIMEOUT_MS - 5_000
			mockFetch.mockImplementationOnce(
				async (_url, init) =>
					new Response(slowBody(['{"a":', "1", "}"], gap, init.signal)),
			)

			const pending = apiGet("https://lpm.dev/api/test", null)
			await vi.advanceTimersByTimeAsync(gap * 3 + 1_000)

			expect(gap * 3).toBeGreaterThan(REQUEST_TIMEOUT_MS)
			expect(await pending).toEqual({ ok: true, status: 200, data: { a: 1 } })
		})

		it("ends a download that trickles past the total timeout, which spans retries", async () => {
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
			const gap = REQUEST_TIMEOUT_MS - 5_000
			const parts = Array.from(
				{ length: Math.ceil(REQUEST_TOTAL_TIMEOUT_MS / gap) + 2 },
				() => " ",
			)
			mockFetch.mockImplementation(
				async (_url, init) => new Response(slowBody(parts, gap, init.signal)),
			)

			let settled = false
			const pending = apiGet("https://lpm.dev/api/test", null).finally(() => {
				settled = true
			})
			await vi.advanceTimersByTimeAsync(REQUEST_TOTAL_TIMEOUT_MS - 1)
			expect(settled).toBe(false)
			await vi.advanceTimersByTimeAsync(2)

			expect(await pending).toEqual({
				ok: false,
				status: 0,
				data: { error: "Request timed out" },
			})
			expect(mockFetch).toHaveBeenCalledTimes(1)
		})

		it("doesn't wait out a retry past the total timeout", async () => {
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
			mockFetch.mockImplementation(
				async (_url, init) =>
					new Response(stalledBody("{", init.signal), { status: 200 }),
			)

			const pending = apiGet("https://lpm.dev/api/test", null)
			await vi.advanceTimersByTimeAsync(REQUEST_TOTAL_TIMEOUT_MS + 1)

			expect(await pending).toEqual({
				ok: false,
				status: 0,
				data: { error: "Request timed out" },
			})
		})

		it("times out a body whose reader ignores the abort signal", async () => {
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
			let cancelled = 0
			const reader = {
				read: () => new Promise(() => {}),
				cancel: async () => {
					cancelled++
				},
			}
			mockFetch.mockResolvedValue({
				ok: true,
				status: 200,
				body: { getReader: () => reader },
				headers: { get: () => null },
			})

			const pending = apiGet("https://lpm.dev/api/test", null)
			await vi.advanceTimersByTimeAsync(REQUEST_TOTAL_TIMEOUT_MS + 1)

			expect(await pending).toEqual({
				ok: false,
				status: 0,
				data: { error: "Request timed out" },
			})
			expect(cancelled).toBeGreaterThan(0)
		})

		it("reads a JSON body that starts with a byte-order mark, as fetch does", async () => {
			mockFetch.mockImplementationOnce(
				async () => new Response('\uFEFF{"name":"valid"}'),
			)

			expect(await apiGet("https://lpm.dev/api/test", null)).toEqual({
				ok: true,
				status: 200,
				data: { name: "valid" },
			})
		})

		it("keeps an auth failure's status when its body breaks off or is too large, without retrying", async () => {
			const broken = new ReadableStream({
				start(controller) {
					controller.enqueue(encoder.encode('{"err'))
					controller.error(new TypeError("terminated"))
				},
			})
			mockFetch.mockImplementationOnce(
				async () => new Response(broken, { status: 401 }),
			)
			expect(await apiGet("https://lpm.dev/api/test", "t")).toEqual({
				ok: false,
				status: 401,
				data: {},
			})
			expect(mockFetch).toHaveBeenCalledTimes(1)

			mockFetch.mockImplementationOnce(
				async () => new Response(endlessBody().body, { status: 403 }),
			)
			expect(await apiGet("https://lpm.dev/api/test", "t")).toEqual({
				ok: false,
				status: 403,
				data: {},
			})
		})

		it("keeps a not-found status when its body is too large", async () => {
			mockFetch.mockImplementationOnce(
				async () => new Response(endlessBody().body, { status: 404 }),
			)

			expect(await apiGet("https://lpm.dev/api/test", null)).toEqual({
				ok: false,
				status: 404,
				data: {},
			})
		})

		it("cancels the body of a response it retries", async () => {
			const { body, stats } = endlessBody()
			mockFetch
				.mockImplementationOnce(async () => new Response(body, { status: 503 }))
				.mockImplementationOnce(async () => new Response('{"ok":true}'))

			const result = await apiGet("https://lpm.dev/api/test", null)

			expect(result).toEqual({ ok: true, status: 200, data: { ok: true } })
			expect(stats.cancels).toBe(1)
		})

		it("answers rate limited at once when the server asks to wait longer than the backoff allows", async () => {
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
			const seconds = Math.ceil(RETRY_MAX_DELAY_MS / 1000) + 1
			mockFetch.mockImplementationOnce(
				async () =>
					new Response("", {
						status: 429,
						headers: { "Retry-After": String(seconds) },
					}),
			)

			// Resolves without any timer advancing, so nothing waited.
			const result = await apiGet("https://lpm.dev/api/test", null)

			expect(result).toEqual({
				ok: false,
				status: 429,
				data: { error: "Rate limited" },
			})
			expect(mockFetch).toHaveBeenCalledTimes(1)
		})

		it("reads text bodies within the same limit and timeouts", async () => {
			mockFetch.mockImplementationOnce(
				async () => new Response("\uFEFF# Docs\n", { status: 200 }),
			)
			expect(await textGet("https://lpm.dev/api/docs")).toEqual({
				ok: true,
				status: 200,
				text: "# Docs\n",
			})

			mockFetch.mockImplementationOnce(
				async () => new Response(endlessBody().body),
			)
			const oversized = await textGet("https://lpm.dev/api/docs")
			expect(oversized.ok).toBe(false)
			expect(oversized.error).toMatch(tooLarge)

			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
			mockFetch.mockImplementationOnce(
				async (_url, init) => new Response(stalledBody("# Do", init.signal)),
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
