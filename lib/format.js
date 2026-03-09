import { ERROR_MESSAGES } from "./constants.js"

/**
 * Create a successful MCP tool response.
 * @param {string} text
 * @returns {{ content: Array<{ type: string, text: string }> }}
 */
export function textResponse(text) {
	return {
		content: [{ type: "text", text }],
	}
}

/**
 * Create an error MCP tool response.
 * @param {string} message
 * @returns {{ content: Array<{ type: string, text: string }>, isError: true }}
 */
export function errorResponse(message) {
	return {
		content: [{ type: "text", text: message }],
		isError: true,
	}
}

/**
 * Create a successful MCP tool response with JSON data.
 * @param {*} data
 * @returns {{ content: Array<{ type: string, text: string }> }}
 */
export function jsonResponse(data) {
	return textResponse(JSON.stringify(data, null, 2))
}

/**
 * Parse a package name in 'owner.pkg' or '@lpm.dev/owner.pkg' format.
 *
 * @param {string} input
 * @returns {{ owner: string, name: string }}
 * @throws {Error} if the format is invalid
 */
export function parseName(input) {
	if (!input || typeof input !== "string") {
		throw new Error(ERROR_MESSAGES.invalidName)
	}

	let cleaned = input.trim()

	// Strip @lpm.dev/ prefix
	if (cleaned.startsWith("@lpm.dev/")) {
		cleaned = cleaned.slice(9)
	}

	const dotIndex = cleaned.indexOf(".")
	if (dotIndex < 1 || dotIndex >= cleaned.length - 1) {
		throw new Error(ERROR_MESSAGES.invalidName)
	}

	const owner = cleaned.substring(0, dotIndex)
	const name = cleaned.substring(dotIndex + 1)

	if (!owner || !name) {
		throw new Error(ERROR_MESSAGES.invalidName)
	}

	return { owner, name }
}
