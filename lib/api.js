// CRITICAL: Never use console.log() — it corrupts the MCP stdio transport

import {
	MAX_RESPONSE_BYTES,
	MAX_RETRIES,
	REQUEST_TIMEOUT_MS,
	RETRY_BACKOFF_MULTIPLIER,
	RETRY_BASE_DELAY_MS,
	RETRY_MAX_DELAY_MS,
	RETRYABLE_STATUS_CODES,
} from "./constants.js"

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

function getBackoffDelay(attempt) {
	const delay = RETRY_BASE_DELAY_MS * RETRY_BACKOFF_MULTIPLIER ** attempt
	const jitter = delay * 0.1 * (Math.random() * 2 - 1)
	return Math.min(delay + jitter, RETRY_MAX_DELAY_MS)
}

function parseRetryAfter(retryAfter) {
	if (!retryAfter) return RETRY_BASE_DELAY_MS

	const seconds = parseInt(retryAfter, 10)
	if (!Number.isNaN(seconds)) return seconds * 1000

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

async function readStreamWithin(body) {
	const reader = body.getReader()
	const chunks = []
	let length = 0
	for (;;) {
		const { done, value } = await reader.read()
		if (done) break
		length += value.byteLength
		if (length > MAX_RESPONSE_BYTES) {
			await reader.cancel().catch(() => {})
			throw new ResponseTooLargeError()
		}
		chunks.push(value)
	}
	return Buffer.concat(chunks, length).toString("utf8")
}

/**
 * Reads a body as text, up to MAX_RESPONSE_BYTES. A body past the limit is
 * cancelled and rejects with ResponseTooLargeError.
 */
async function readTextWithin(response) {
	const declared = Number(response.headers?.get?.("content-length"))
	if (declared > MAX_RESPONSE_BYTES) {
		await response.body?.cancel?.().catch(() => {})
		throw new ResponseTooLargeError()
	}
	if (typeof response.body?.getReader === "function") {
		return readStreamWithin(response.body)
	}
	return typeof response.text === "function" ? response.text() : ""
}

/** Parses a JSON body within the size limit; a malformed body reads as `{}`. */
async function readJsonWithin(response) {
	// A response without a body stream (no content, or a test double).
	if (
		typeof response.body?.getReader !== "function" &&
		typeof response.json === "function"
	) {
		return response.json().catch(() => ({}))
	}
	const text = await readTextWithin(response)
	try {
		return JSON.parse(text)
	} catch {
		return {}
	}
}

function discardBody(response) {
	response.body?.cancel?.().catch(() => {})
}

/**
 * Runs `read` on a GET response with one timeout covering both the request
 * and the body, so a server that sends headers and then stalls still times
 * out.
 *
 * @template T
 * @param {string} url
 * @param {RequestInit} init
 * @param {(response: Response) => Promise<T>} read
 * @returns {Promise<T>}
 */
async function fetchWithin(url, init, read) {
	const controller = new AbortController()
	const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
	try {
		const response = await fetch(url, { ...init, signal: controller.signal })
		return await read(response)
	} finally {
		clearTimeout(timeoutId)
	}
}

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

	let lastError = null

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		try {
			const outcome = await fetchWithin(
				url,
				{ method: "GET", headers },
				async response => {
					// No retry on auth errors
					if (response.status === 401 || response.status === 403) {
						return {
							result: {
								ok: false,
								status: response.status,
								data: await readJsonWithin(response),
							},
						}
					}

					// Rate limiting
					if (response.status === 429) {
						discardBody(response)
						if (attempt < MAX_RETRIES) {
							return {
								retryAfterMs: parseRetryAfter(
									response.headers.get("Retry-After"),
								),
							}
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
							data: await readJsonWithin(response),
						},
					}
				},
			)

			if (outcome.result) return outcome.result
			await sleep(outcome.retryAfterMs)
		} catch (error) {
			// The same body would be too large again.
			if (error instanceof ResponseTooLargeError) {
				return { ok: false, status: 0, data: { error: error.message } }
			}

			lastError = error

			if (attempt < MAX_RETRIES) {
				await sleep(getBackoffDelay(attempt))
				continue
			}

			if (error.name === "AbortError") {
				return { ok: false, status: 0, data: { error: "Request timed out" } }
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
 * GET a text body once, within the request timeout and size limit.
 *
 * @param {string} url
 * @param {Record<string, string>} [headers]
 * @returns {Promise<{ok: true, status: number, text: string} | {ok: false, status: number, text?: string, error?: string}>}
 */
export async function textGet(url, headers = { Accept: "text/plain" }) {
	try {
		return await fetchWithin(
			url,
			{ method: "GET", headers },
			async response => {
				if (!response.ok) {
					discardBody(response)
					return { ok: false, status: response.status }
				}
				return {
					ok: true,
					status: response.status,
					text: await readTextWithin(response),
				}
			},
		)
	} catch (error) {
		if (error.name === "AbortError") {
			return { ok: false, status: 0, error: "Request timed out" }
		}
		return { ok: false, status: 0, error: error.message || "Network error" }
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
