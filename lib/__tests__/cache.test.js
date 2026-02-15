import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryCache } from '../cache.js'

describe('MemoryCache', () => {
	let cache

	beforeEach(() => {
		cache = new MemoryCache()
	})

	it('stores and retrieves values', () => {
		cache.set('key', 'value', 60_000)
		expect(cache.get('key')).toBe('value')
	})

	it('returns undefined for non-existent keys', () => {
		expect(cache.get('missing')).toBeUndefined()
	})

	it('returns undefined for expired entries', () => {
		cache.set('key', 'value', 1) // 1ms TTL
		vi.advanceTimersByTime(10)
		expect(cache.get('key')).toBeUndefined()
	})

	it('cleans up expired entries on access', () => {
		cache.set('key', 'value', 1)
		vi.advanceTimersByTime(10)
		cache.get('key')
		expect(cache.size).toBe(0)
	})

	it('has() returns false for expired entries', () => {
		cache.set('key', 'value', 1)
		vi.advanceTimersByTime(10)
		expect(cache.has('key')).toBe(false)
	})

	it('has() returns true for valid entries', () => {
		cache.set('key', 'value', 60_000)
		expect(cache.has('key')).toBe(true)
	})

	it('set() with ttlMs=0 is a no-op', () => {
		cache.set('key', 'value', 0)
		expect(cache.get('key')).toBeUndefined()
		expect(cache.size).toBe(0)
	})

	it('delete() removes an entry', () => {
		cache.set('key', 'value', 60_000)
		cache.delete('key')
		expect(cache.get('key')).toBeUndefined()
	})

	it('clear() removes all entries', () => {
		cache.set('a', 1, 60_000)
		cache.set('b', 2, 60_000)
		cache.clear()
		expect(cache.size).toBe(0)
	})

	it('size reflects stored entries', () => {
		cache.set('a', 1, 60_000)
		cache.set('b', 2, 60_000)
		expect(cache.size).toBe(2)
	})

	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})
})
