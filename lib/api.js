// CRITICAL: Never use console.log() — it corrupts the MCP stdio transport

import {
	MAX_RETRIES,
	REQUEST_TIMEOUT_MS,
	RETRYABLE_STATUS_CODES,
	RETRY_BACKOFF_MULTIPLIER,
	RETRY_BASE_DELAY_MS,
	RETRY_MAX_DELAY_MS,
} from './constants.js'

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
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

		try {
			const response = await fetch(url, {
				method: 'GET',
				headers,
				signal: controller.signal,
			})

			clearTimeout(timeoutId)

			// No retry on auth errors
			if (response.status === 401 || response.status === 403) {
				const data = await response.json().catch(() => ({}))
				return { ok: false, status: response.status, data }
			}

			// Rate limiting
			if (response.status === 429) {
				const retryAfter = response.headers.get('Retry-After')
				const delayMs = parseRetryAfter(retryAfter)

				if (attempt < MAX_RETRIES) {
					await sleep(delayMs)
					continue
				}

				return { ok: false, status: 429, data: { error: 'Rate limited' } }
			}

			// Retryable server errors
			if (RETRYABLE_STATUS_CODES.includes(response.status) && attempt < MAX_RETRIES) {
				await sleep(getBackoffDelay(attempt))
				continue
			}

			const data = await response.json().catch(() => ({}))
			return { ok: response.ok, status: response.status, data }
		} catch (error) {
			clearTimeout(timeoutId)

			lastError = error

			if (attempt < MAX_RETRIES) {
				await sleep(getBackoffDelay(attempt))
				continue
			}

			if (error.name === 'AbortError') {
				return { ok: false, status: 0, data: { error: 'Request timed out' } }
			}

			return { ok: false, status: 0, data: { error: error.message || 'Network error' } }
		}
	}

	return {
		ok: false,
		status: 0,
		data: { error: lastError?.message || 'Network error' },
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
