// CRITICAL: Never use console.log() — it corrupts the MCP stdio transport

import {
	MAX_RESPONSE_BYTES,
	MAX_RETRIES,
	REQUEST_TIMEOUT_MS,
	REQUEST_TOTAL_TIMEOUT_MS,
	RETRY_BACKOFF_MULTIPLIER,
	RETRY_BASE_DELAY_MS,
	RETRY_MAX_DELAY_MS,
	RETRYABLE_STATUS_CODES,
} from "./constants.js"

/** Waits `ms`, or until `signal` aborts. */
function sleep(ms, signal) {
	return new Promise(resolve => {
		if (signal?.aborted) return resolve()
		const done = () => {
			clearTimeout(timer)
			signal?.removeEventListener("abort", done)
			resolve()
		}
		const timer = setTimeout(done, ms)
		signal?.addEventListener("abort", done, { once: true })
	})
}

function abortError() {
	return new DOMException("The request was aborted", "AbortError")
}

/**
 * `promise`, or a rejection once `signal` aborts. Built-in fetch ends a body
 * read when its signal aborts, but a replacement may not, and the read would
 * then hang past every timeout.
 */
function untilAborted(promise, signal) {
	if (!signal) return promise
	if (signal.aborted) return Promise.reject(abortError())
	return new Promise((resolve, reject) => {
		const onAbort = () => reject(abortError())
		signal.addEventListener("abort", onAbort, { once: true })
		promise.then(
			value => {
				signal.removeEventListener("abort", onAbort)
				resolve(value)
			},
			error => {
				signal.removeEventListener("abort", onAbort)
				reject(error)
			},
		)
	})
}

function getBackoffDelay(attempt) {
	const delay = RETRY_BASE_DELAY_MS * RETRY_BACKOFF_MULTIPLIER ** attempt
	const jitter = delay * 0.1 * (Math.random() * 2 - 1)
	return Math.min(delay + jitter, RETRY_MAX_DELAY_MS)
}

function parseRetryAfter(retryAfter) {
	if (!retryAfter) return RETRY_BASE_DELAY_MS

	const seconds = parseInt(retryAfter, 10)
	if (!Number.isNaN(seconds)) return Math.max(0, seconds * 1000)

	const date = new Date(retryAfter)
	if (!Number.isNaN(date.getTime())) {
		return Math.max(0, date.getTime() - Date.now())
	}

	return RETRY_BASE_DELAY_MS
}

class ResponseTooLargeError extends Error {
	constructor() {
		super(`Response was larger than ${MAX_RESPONSE_BYTES / (1024 * 1024)} MB`)
		this.name = "ResponseTooLargeError"
	}
}

/**
 * Reads a body's bytes up to MAX_RESPONSE_BYTES and decodes them as UTF-8,
 * dropping a byte-order mark as `response.text()` does. `progress` is called
 * for each chunk, so a download that keeps arriving isn't timed out as idle.
 */
async function readBodyWithin(body, { progress, signal }) {
	const chunks = []
	let length = 0
	const add = chunk => {
		progress()
		length += chunk.byteLength
		if (length > MAX_RESPONSE_BYTES) throw new ResponseTooLargeError()
		chunks.push(chunk)
	}
	// A web stream, as fetch gives, or a Node stream, as replacements such as
	// node-fetch give. Either is cancelled when the read stops early.
	const reader =
		typeof body.getReader === "function"
			? body.getReader()
			: body[Symbol.asyncIterator]()
	const next = () =>
		untilAborted(
			typeof reader.read === "function" ? reader.read() : reader.next(),
			signal,
		)
	try {
		for (;;) {
			const { done, value } = await next()
			if (done) break
			add(value)
		}
	} catch (error) {
		if (typeof reader.cancel === "function") {
			await reader.cancel().catch(() => {})
		} else {
			await reader.return?.().catch(() => {})
			body.destroy?.()
		}
		throw error
	}
	return new TextDecoder().decode(Buffer.concat(chunks, length))
}

/**
 * Reads a body as text, up to MAX_RESPONSE_BYTES. A body past the limit is
 * cancelled and rejects with ResponseTooLargeError.
 */
async function readTextWithin(response, reading) {
	const declared = Number(response.headers?.get?.("content-length"))
	if (declared > MAX_RESPONSE_BYTES) {
		discardBody(response)
		throw new ResponseTooLargeError()
	}
	if (response.body == null) {
		return typeof response.text === "function" ? response.text() : ""
	}
	return readBodyWithin(response.body, reading)
}

/** Parses a JSON body within the size limit; a malformed body reads as `{}`. */
async function readJsonWithin(response, reading) {
	// Without a body there is nothing to bound: fetch gives one for every
	// response with content, so this is an empty response or a test double.
	if (response.body == null && typeof response.json === "function") {
		return response.json().catch(() => ({}))
	}
	const text = await readTextWithin(response, reading)
	try {
		return JSON.parse(text)
	} catch {
		return {}
	}
}

/**
 * The JSON body of an error response, or `{}` when it can't be read: the
 * status is what callers act on, and it must not be lost to a body that is
 * too large, breaks off or stalls.
 */
async function readErrorBody(response, reading) {
	try {
		return await readJsonWithin(response, reading)
	} catch {
		return {}
	}
}

function discardBody(response) {
	const body = response.body
	if (typeof body?.cancel === "function") body.cancel().catch(() => {})
	else body?.destroy?.()
}

/**
 * Runs `read` on a GET response. The request and its body have an idle
 * timeout, restarted by each chunk, so a server that sends headers and then
 * stalls still times out. `deadline` aborts it too: it is the call's total
 * timeout, which spans its retries.
 *
 * @template T
 * @param {string} url
 * @param {RequestInit} init
 * @param {AbortSignal} deadline
 * @param {(response: Response, reading: { progress: () => void, signal: AbortSignal }) => Promise<T>} read
 * @returns {Promise<T>}
 */
async function fetchWithin(url, init, deadline, read) {
	const controller = new AbortController()
	const abort = () => controller.abort()
	let idle = setTimeout(abort, REQUEST_TIMEOUT_MS)
	deadline.addEventListener("abort", abort, { once: true })
	const progress = () => {
		clearTimeout(idle)
		idle = setTimeout(abort, REQUEST_TIMEOUT_MS)
	}
	try {
		if (deadline.aborted) throw abortError()
		const response = await fetch(url, { ...init, signal: controller.signal })
		progress()
		return await read(response, { progress, signal: controller.signal })
	} finally {
		clearTimeout(idle)
		deadline.removeEventListener("abort", abort)
	}
}

/** A signal that aborts after REQUEST_TOTAL_TIMEOUT_MS, and its cleanup. */
function totalDeadline() {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), REQUEST_TOTAL_TIMEOUT_MS)
	return { signal: controller.signal, clear: () => clearTimeout(timer) }
}

const TIMED_OUT = { error: "Request timed out" }

/**
 * Make a GET request with retry, timeout, and rate limit handling.
 *
 * @param {string} url - Full URL to fetch
 * @param {string | null} token - Bearer token (null to skip auth header)
 * @returns {Promise<{ok: boolean, status: number, data: *}>}
 */
export async function apiGet(url, token) {
	const headers = {}
	if (token) {
		headers.Authorization = `Bearer ${token}`
	}

	const deadline = totalDeadline()
	try {
		return await apiGetWithin(url, headers, deadline.signal)
	} finally {
		deadline.clear()
	}
}

async function apiGetWithin(url, headers, deadline) {
	let lastError = null

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		try {
			const outcome = await fetchWithin(
				url,
				{ method: "GET", headers },
				deadline,
				async (response, reading) => {
					// No retry on auth errors
					if (response.status === 401 || response.status === 403) {
						return {
							result: {
								ok: false,
								status: response.status,
								data: await readErrorBody(response, reading),
							},
						}
					}

					// Rate limiting. A server that asks for a longer wait than the
					// backoff allows is answered as rate limited rather than waited on.
					if (response.status === 429) {
						discardBody(response)
						const delay = parseRetryAfter(response.headers.get("Retry-After"))
						if (attempt < MAX_RETRIES && delay <= RETRY_MAX_DELAY_MS) {
							return { retryAfterMs: delay }
						}
						return {
							result: {
								ok: false,
								status: 429,
								data: { error: "Rate limited" },
							},
						}
					}

					// Retryable server errors
					if (
						RETRYABLE_STATUS_CODES.includes(response.status) &&
						attempt < MAX_RETRIES
					) {
						discardBody(response)
						return { retryAfterMs: getBackoffDelay(attempt) }
					}

					return {
						result: {
							ok: response.ok,
							status: response.status,
							data: response.ok
								? await readJsonWithin(response, reading)
								: await readErrorBody(response, reading),
						},
					}
				},
			)

			if (outcome.result) return outcome.result
			await sleep(outcome.retryAfterMs, deadline)
			if (deadline.aborted) return { ok: false, status: 0, data: TIMED_OUT }
		} catch (error) {
			// The same body would be too large again.
			if (error instanceof ResponseTooLargeError) {
				return { ok: false, status: 0, data: { error: error.message } }
			}
			// The call's total timeout spans its retries.
			if (deadline.aborted) return { ok: false, status: 0, data: TIMED_OUT }

			lastError = error

			if (attempt < MAX_RETRIES) {
				await sleep(getBackoffDelay(attempt), deadline)
				if (deadline.aborted) return { ok: false, status: 0, data: TIMED_OUT }
				continue
			}

			if (error.name === "AbortError") {
				return { ok: false, status: 0, data: TIMED_OUT }
			}

			return {
				ok: false,
				status: 0,
				data: { error: error.message || "Network error" },
			}
		}
	}

	return {
		ok: false,
		status: 0,
		data: { error: lastError?.message || "Network error" },
	}
}

/**
 * GET a text body once, within the request timeouts and size limit.
 *
 * @param {string} url
 * @param {Record<string, string>} [headers]
 * @returns {Promise<{ok: true, status: number, text: string} | {ok: false, status: number, text?: string, error?: string}>}
 */
export async function textGet(url, headers = { Accept: "text/plain" }) {
	const deadline = totalDeadline()
	try {
		return await fetchWithin(
			url,
			{ method: "GET", headers },
			deadline.signal,
			async (response, reading) => {
				if (!response.ok) {
					discardBody(response)
					return { ok: false, status: response.status }
				}
				return {
					ok: true,
					status: response.status,
					text: await readTextWithin(response, reading),
				}
			},
		)
	} catch (error) {
		if (error.name === "AbortError") {
			return { ok: false, status: 0, error: "Request timed out" }
		}
		return { ok: false, status: 0, error: error.message || "Network error" }
	} finally {
		deadline.clear()
	}
}

/**
 * GET from the registry API (/api/registry prefix).
 *
 * @param {string} path - Path after /api/registry (e.g., '/-/whoami')
 * @param {string | null} token
 * @param {string} baseUrl
 * @returns {Promise<{ok: boolean, status: number, data: *}>}
 */
export function registryGet(path, token, baseUrl) {
	return apiGet(`${baseUrl}/api/registry${path}`, token)
}

/**
 * GET from the search API (/api/search prefix).
 *
 * @param {string} path - Path after /api/search (e.g., '/packages?q=react')
 * @param {string | null} token
 * @param {string} baseUrl
 * @returns {Promise<{ok: boolean, status: number, data: *}>}
 */
export function searchGet(path, token, baseUrl) {
	return apiGet(`${baseUrl}/api/search${path}`, token)
}
