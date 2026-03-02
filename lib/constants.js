// CRITICAL: Never use console.log() in this package — it corrupts the MCP stdio transport

export const DEFAULT_REGISTRY_URL = 'https://lpm.dev'

export const KEYTAR_SERVICE_NAME = 'lpm-cli'
export const KEYTAR_ACCOUNT_NAME = 'auth-token'

export const REQUEST_TIMEOUT_MS = 30_000
export const MAX_RETRIES = 2
export const RETRY_BASE_DELAY_MS = 1_000
export const RETRY_MAX_DELAY_MS = 10_000
export const RETRY_BACKOFF_MULTIPLIER = 2

export const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504]

export const CACHE_TTL = {
	SHORT: 5 * 60 * 1000,
	LONG: 60 * 60 * 1000,
	NONE: 0,
}

export const ERROR_MESSAGES = {
	noToken: 'No LPM token found. Set LPM_TOKEN environment variable or run `lpm login` first.',
	unauthorized: 'Authentication failed. Your token may be expired or revoked. Run `lpm login` to re-authenticate.',
	notFound: 'Package not found. Check the name format: owner.package-name',
	accessDenied: 'Access denied. This package may be private.',
	rateLimited: 'Rate limited. Please wait and try again.',
	networkError: 'Cannot reach lpm.dev. Check your internet connection.',
	timeout: 'Request timed out. Try again later.',
	invalidName: 'Invalid package name format. Expected: owner.package-name or @lpm.dev/owner.package-name',
	searchNoParams: 'At least one of "query" or "category" is required.',
}
