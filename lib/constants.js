// CRITICAL: Never use console.log() in this package — it corrupts the MCP stdio transport

export const DEFAULT_REGISTRY_URL = "https://lpm.dev"

export const RETIREMENT_NOTICE =
	"@lpm-registry/mcp-server is retired and gets no more updates. LPM CLI 0.86.0 and later serve MCP themselves: upgrade the LPM CLI, then run `lpm mcp setup` so your editors start `lpm mcp serve`. See https://cli.lpm.dev/docs/reference/mcp-servers#upgrading-from-the-npm-server"

export const KEYTAR_SERVICE_NAME = "lpm-cli"
export const KEYTAR_ACCOUNT_PREFIX = "auth-token"

// How long a request may wait for headers, or between chunks of its body.
export const REQUEST_TIMEOUT_MS = 30_000
// How long a request may take in all, its body included.
export const REQUEST_TOTAL_TIMEOUT_MS = 120_000
// A registry response is parsed whole on the server's only thread, so its
// size is bounded. Package documents grow with every version, and each
// version's lpmConfig can be 128 KB, so the limit leaves room for large
// packages: parsing 50 MB takes about 80 ms.
export const MAX_RESPONSE_BYTES = 50 * 1024 * 1024
export const MAX_SOURCE_TREE_ENTRIES = 2_000
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
	noToken:
		"No LPM token found. Set LPM_TOKEN environment variable or run `lpm login` first.",
	unauthorized:
		"Authentication failed. Your token may be expired or revoked. Run `lpm login` to re-authenticate.",
	notFound: "Package not found. Check the name format: owner.package-name",
	accessDenied: "Access denied. This package may be private.",
	rateLimited: "Rate limited. Please wait and try again.",
	networkError: "Cannot reach lpm.dev. Check your internet connection.",
	timeout: "Request timed out. Try again later.",
	invalidName:
		"Invalid package name format. Expected: owner.package-name or @lpm.dev/owner.package-name",
	searchNoParams: "A search query or structured filter is required.",
}
