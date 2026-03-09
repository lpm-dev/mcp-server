import {
	DEFAULT_REGISTRY_URL,
	KEYTAR_ACCOUNT_NAME,
	KEYTAR_SERVICE_NAME,
} from "./constants.js"

/**
 * Resolve the LPM auth token.
 * Priority: LPM_TOKEN env var → OS keychain (via keytar) → null
 *
 * @returns {Promise<string | null>}
 */
export async function getToken() {
	// 1. Environment variable (recommended for MCP configs)
	if (process.env.LPM_TOKEN) {
		return process.env.LPM_TOKEN
	}

	// 2. OS keychain (reads from same store as `lpm login`)
	try {
		const keytar = await import("keytar")
		const token = await keytar.default.getPassword(
			KEYTAR_SERVICE_NAME,
			KEYTAR_ACCOUNT_NAME,
		)
		if (token) return token
	} catch {
		// keytar not available — this is expected in many environments
	}

	return null
}

/**
 * Resolve the LPM registry base URL.
 * Priority: LPM_REGISTRY_URL env var → default
 *
 * @returns {string}
 */
export function getBaseUrl() {
	return process.env.LPM_REGISTRY_URL || DEFAULT_REGISTRY_URL
}
