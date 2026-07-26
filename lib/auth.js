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
 * Apply the same registry override acceptance contract as LPM CLI.
 *
 * @param {string | undefined} raw
 * @returns {string}
 */
export function resolveRegistryUrl(raw = process.env.LPM_REGISTRY_URL) {
	if (!raw) return DEFAULT_REGISTRY_URL

	const separator = raw.indexOf("://")
	if (separator <= 0 || separator + 3 >= raw.length) {
		return DEFAULT_REGISTRY_URL
	}

	const scheme = raw.slice(0, separator).toLowerCase()
	if (scheme !== "http" && scheme !== "https") {
		return DEFAULT_REGISTRY_URL
	}

	let authority = raw.slice(separator + 3).split(/[/?#]/, 1)[0]
	const userinfo = authority.lastIndexOf("@")
	if (userinfo !== -1) authority = authority.slice(userinfo + 1)

	let host
	if (authority.startsWith("[")) {
		const end = authority.indexOf("]")
		if (end === -1) return DEFAULT_REGISTRY_URL
		host = authority.slice(0, end + 1)
	} else {
		host = authority.split(":", 1)[0]
	}
	if (!host) return DEFAULT_REGISTRY_URL
	if (scheme === "https" || isLoopbackHost(host)) return raw
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
	return (
		version === 6 && new URL(`http://[${unbracketed}]/`).hostname === "[::1]"
	)
}
