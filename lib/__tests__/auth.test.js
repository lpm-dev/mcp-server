import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock keytar before imports
vi.mock("keytar", () => ({
	default: {
		getPassword: vi.fn(),
	},
}))

import {
	getBaseUrl,
	getKeychainAccount,
	getToken,
	resolveRegistryUrl,
} from "../auth.js"

describe("auth", () => {
	const originalEnv = process.env

	beforeEach(() => {
		process.env = { ...originalEnv }
		delete process.env.LPM_TOKEN
		delete process.env.LPM_REGISTRY_URL
		vi.clearAllMocks()
	})

	afterEach(() => {
		process.env = originalEnv
		vi.restoreAllMocks()
	})

	describe("getToken", () => {
		it("returns LPM_TOKEN env var when set", async () => {
			process.env.LPM_TOKEN = "lpm_test_token"
			const token = await getToken()
			expect(token).toBe("lpm_test_token")
		})

		it("reads the registry-scoped keychain account when env var is not set", async () => {
			const keytar = await import("keytar")
			keytar.default.getPassword.mockResolvedValueOnce("lpm_keychain_token")

			const token = await getToken()
			expect(token).toBe("lpm_keychain_token")
			expect(keytar.default.getPassword).toHaveBeenCalledWith(
				"lpm-cli",
				"auth-token:bd90fc32d95766d5",
			)
			expect(keytar.default.getPassword).not.toHaveBeenCalledWith(
				"lpm-cli",
				"auth-token",
			)
		})

		it("returns null when keytar has no token", async () => {
			const keytar = await import("keytar")
			keytar.default.getPassword.mockResolvedValueOnce(null)

			const token = await getToken()
			expect(token).toBeNull()
		})

		it("prefers env var over keytar", async () => {
			process.env.LPM_TOKEN = "lpm_env_token"
			const keytar = await import("keytar")

			const token = await getToken()
			expect(token).toBe("lpm_env_token")
			expect(keytar.default.getPassword).not.toHaveBeenCalled()
		})

		it("uses a different scoped account for a custom registry", async () => {
			process.env.LPM_REGISTRY_URL = "https://registry.example.com/custom"
			const keytar = await import("keytar")
			keytar.default.getPassword.mockResolvedValueOnce("custom-token")

			await expect(getToken()).resolves.toBe("custom-token")
			expect(keytar.default.getPassword).toHaveBeenCalledWith(
				"lpm-cli",
				"auth-token:1658e811bb24ec08",
			)
		})

		it("returns null when the optional keytar module is unavailable", async () => {
			const unavailable = Object.assign(new Error("planted-token"), {
				code: "ERR_MODULE_NOT_FOUND",
			})

			await expect(
				getToken(async () => {
					throw unavailable
				}),
			).resolves.toBeNull()
		})

		it("sanitizes keychain backend errors", async () => {
			const plantedToken = "lpm_must_not_escape"
			const backend = {
				getPassword: vi.fn().mockRejectedValue(new Error(plantedToken)),
			}

			const error = await getToken(async () => backend).catch(reason => reason)
			expect(error).toBeInstanceOf(Error)
			expect(error.message).toContain("Unable to read LPM credentials")
			expect(error.message).not.toContain(plantedToken)
		})

		it("sanitizes unexpected keytar import errors", async () => {
			const plantedToken = "lpm_import_secret"

			const error = await getToken(async () => {
				throw new Error(plantedToken)
			}).catch(reason => reason)
			expect(error).toBeInstanceOf(Error)
			expect(error.message).toContain("Unable to read LPM credentials")
			expect(error.message).not.toContain(plantedToken)
		})
	})

	describe("getBaseUrl", () => {
		it("returns LPM_REGISTRY_URL env var when set", () => {
			process.env.LPM_REGISTRY_URL = "https://custom.registry.dev"
			expect(getBaseUrl()).toBe("https://custom.registry.dev")
		})

		it("returns default URL when env var not set", () => {
			expect(getBaseUrl()).toBe("https://lpm.dev")
		})

		it("falls back to the default for an empty environment override", () => {
			process.env.LPM_REGISTRY_URL = ""
			expect(getBaseUrl()).toBe("https://lpm.dev")
		})
	})

	describe("registry-scoped keychain accounts", () => {
		it.each([
			["https://lpm.dev", "auth-token:bd90fc32d95766d5"],
			["https://lpm.dev/", "auth-token:89f54e26677b97ec"],
			["http://localhost:3000", "auth-token:f1de9e489ba88cb1"],
			["http://127.0.0.1:8787", "auth-token:b1a61bf29a38ff36"],
			["https://registry.example.com/custom", "auth-token:1658e811bb24ec08"],
		])("derives the Rust account vector for %s", (registryUrl, account) => {
			expect(getKeychainAccount(registryUrl)).toBe(account)
		})

		it("falls back to the hosted registry for a rejected HTTP override", () => {
			expect(resolveRegistryUrl("http://registry.example.com")).toBe(
				"https://lpm.dev",
			)
		})

		it.each([
			"http://localhost:3000/path",
			"http://127.42.0.1:8787",
			"http://[::1]:8787",
			"http://[0:0:0:0:0:0:0:1]:8787",
			"https://registry.example.com/custom/",
		])("retains the exact accepted registry string %s", registryUrl => {
			expect(resolveRegistryUrl(registryUrl)).toBe(registryUrl)
		})

		it.each([
			"ftp://localhost",
			"http://192.168.1.10",
			"http://[::2]:8787",
			"registry.example.com",
			"https://",
		])("falls back for the rejected registry string %s", registryUrl => {
			expect(resolveRegistryUrl(registryUrl)).toBe("https://lpm.dev")
		})
	})
})
