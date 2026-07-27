import { createHash } from "node:crypto"
import { isIP } from "node:net"
import {
	DEFAULT_REGISTRY_URL,
	KEYTAR_ACCOUNT_PREFIX,
	KEYTAR_SERVICE_NAME,
} from "./constants.js"

const KEYCHAIN_READ_ERROR =
	"Unable to read LPM credentials from the OS keychain. Set LPM_TOKEN or run `lpm login` and retry."

/**
 * Resolve the LPM auth token.
 * Priority: LPM_TOKEN env var → OS keychain (via keytar) → null
 *
 * @param {() => Promise<unknown>} [loadKeytar]
 * @returns {Promise<string | null>}
 */
export async function getToken(loadKeytar = () => import("keytar")) {
	if (process.env.LPM_TOKEN) {
		return process.env.LPM_TOKEN
	}

	let keytarModule
	try {
		keytarModule = await loadKeytar()
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			(error.code === "ERR_MODULE_NOT_FOUND" ||
				error.code === "MODULE_NOT_FOUND")
		) {
			return null
		}
		throw new Error(KEYCHAIN_READ_ERROR)
	}

	try {
		const keytar = keytarModule.default ?? keytarModule
		const token = await keytar.getPassword(
			KEYTAR_SERVICE_NAME,
			getKeychainAccount(),
		)
		if (token) return token
	} catch {
		throw new Error(KEYCHAIN_READ_ERROR)
	}

	return null
}

/**
 * Apply the LPM CLI's default registry transport contract: HTTPS, or HTTP
 * only for loopback. The MCP server has no `--insecure` remote-HTTP escape hatch.
 *
 * @param {string | undefined} raw
 * @returns {string}
 */
export function resolveRegistryUrl(raw = process.env.LPM_REGISTRY_URL) {
	if (!raw) return DEFAULT_REGISTRY_URL

	let parsed
	try {
		parsed = new URL(raw)
	} catch {
		return DEFAULT_REGISTRY_URL
	}

	if (parsed.protocol === "https:") return raw
	if (parsed.protocol === "http:" && isLoopbackHost(parsed.hostname)) return raw
	return DEFAULT_REGISTRY_URL
}

/**
 * Resolve the LPM registry base URL.
 * Priority: LPM_REGISTRY_URL env var → default
 *
 * @returns {string}
 */
export function getBaseUrl() {
	return resolveRegistryUrl()
}

/**
 * Derive the keychain account used by LPM CLI for one effective registry URL.
 *
 * @param {string} [registryUrl]
 * @returns {string}
 */
export function getKeychainAccount(registryUrl = getBaseUrl()) {
	const digest = createHash("sha256").update(registryUrl, "utf8").digest("hex")
	return `${KEYTAR_ACCOUNT_PREFIX}:${digest.slice(0, 16)}`
}

function isLoopbackHost(host) {
	const unbracketed =
		host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host
	if (unbracketed.toLowerCase() === "localhost") return true

	const version = isIP(unbracketed)
	if (version === 4) return unbracketed.split(".", 1)[0] === "127"
	if (version !== 6) return false

	const normalized = new URL(`http://[${unbracketed}]/`).hostname
		.slice(1, -1)
		.toLowerCase()
	if (normalized === "::1") return true

	const mapped = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
	if (!mapped) return false
	const high = Number.parseInt(mapped[1], 16)
	return high >> 8 === 127
}
