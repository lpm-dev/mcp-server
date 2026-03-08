import { describe, expect, it } from "vitest"
import { errorResponse, jsonResponse, parseName, textResponse } from "../format.js"

describe("textResponse", () => {
	it("wraps text in MCP content array", () => {
		const result = textResponse("hello")

		expect(result).toEqual({
			content: [{ type: "text", text: "hello" }],
		})
	})

	it("does not set isError", () => {
		const result = textResponse("hello")

		expect(result.isError).toBeUndefined()
	})
})

describe("errorResponse", () => {
	it("wraps message in MCP content array with isError", () => {
		const result = errorResponse("something went wrong")

		expect(result).toEqual({
			content: [{ type: "text", text: "something went wrong" }],
			isError: true,
		})
	})

	it("always sets isError to true", () => {
		expect(errorResponse("").isError).toBe(true)
	})
})

describe("jsonResponse", () => {
	it("serializes data as formatted JSON", () => {
		const result = jsonResponse({ name: "test", count: 42 })
		const parsed = JSON.parse(result.content[0].text)

		expect(parsed).toEqual({ name: "test", count: 42 })
	})

	it("pretty-prints with 2 spaces", () => {
		const result = jsonResponse({ a: 1 })
		const text = result.content[0].text

		expect(text).toBe(JSON.stringify({ a: 1 }, null, 2))
	})

	it("does not set isError", () => {
		const result = jsonResponse({})

		expect(result.isError).toBeUndefined()
	})

	it("handles arrays", () => {
		const result = jsonResponse([1, 2, 3])
		const parsed = JSON.parse(result.content[0].text)

		expect(parsed).toEqual([1, 2, 3])
	})

	it("handles null", () => {
		const result = jsonResponse(null)

		expect(result.content[0].text).toBe("null")
	})
})

describe("parseName", () => {
	it("parses owner.package format", () => {
		const result = parseName("alice.my-package")

		expect(result).toEqual({ owner: "alice", name: "my-package" })
	})

	it("parses @lpm.dev/owner.package format", () => {
		const result = parseName("@lpm.dev/alice.my-package")

		expect(result).toEqual({ owner: "alice", name: "my-package" })
	})

	it("trims whitespace", () => {
		const result = parseName("  alice.my-package  ")

		expect(result).toEqual({ owner: "alice", name: "my-package" })
	})

	it("handles package names with multiple dots", () => {
		const result = parseName("alice.my.dotted.package")

		expect(result).toEqual({ owner: "alice", name: "my.dotted.package" })
	})

	it("throws on null input", () => {
		expect(() => parseName(null)).toThrow("Invalid package name")
	})

	it("throws on undefined input", () => {
		expect(() => parseName(undefined)).toThrow("Invalid package name")
	})

	it("throws on empty string", () => {
		expect(() => parseName("")).toThrow("Invalid package name")
	})

	it("throws on non-string input", () => {
		expect(() => parseName(123)).toThrow("Invalid package name")
	})

	it("throws when no dot separator", () => {
		expect(() => parseName("no-dot")).toThrow("Invalid package name")
	})

	it("throws when dot is first character", () => {
		expect(() => parseName(".package")).toThrow("Invalid package name")
	})

	it("throws when dot is last character", () => {
		expect(() => parseName("owner.")).toThrow("Invalid package name")
	})
})
