/**
 * Simple in-memory cache with TTL support.
 * Used to reduce API calls for repeated queries within an MCP session.
 * It holds at most `maxEntries`, dropping the least recently used, since a
 * long session can ask about any number of packages and paths.
 */
export class MemoryCache {
	constructor({ maxEntries = 500 } = {}) {
		this._store = new Map()
		this._maxEntries = maxEntries
	}

	/**
	 * Get a cached value. Returns undefined if missing or expired.
	 * @param {string} key
	 * @returns {*}
	 */
	get(key) {
		const entry = this._store.get(key)
		if (!entry) return undefined

		if (Date.now() > entry.expiresAt) {
			this._store.delete(key)
			return undefined
		}

		this._store.delete(key)
		this._store.set(key, entry)
		return entry.value
	}

	/**
	 * Store a value with a TTL. If ttlMs is 0 or falsy, this is a no-op.
	 * @param {string} key
	 * @param {*} value
	 * @param {number} ttlMs
	 */
	set(key, value, ttlMs) {
		if (!ttlMs) return

		this._store.delete(key)
		while (this._store.size >= this._maxEntries) {
			this._store.delete(this._store.keys().next().value)
		}
		this._store.set(key, {
			value,
			expiresAt: Date.now() + ttlMs,
		})
	}

	/**
	 * Check if a valid (non-expired) entry exists.
	 * @param {string} key
	 * @returns {boolean}
	 */
	has(key) {
		return this.get(key) !== undefined
	}

	/**
	 * Remove a specific entry.
	 * @param {string} key
	 */
	delete(key) {
		this._store.delete(key)
	}

	/**
	 * Remove all entries.
	 */
	clear() {
		this._store.clear()
	}

	/**
	 * Number of entries (including potentially expired ones).
	 * @returns {number}
	 */
	get size() {
		return this._store.size
	}
}
