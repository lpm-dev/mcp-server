import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { afterEach, expect, it, vi } from "vitest"

vi.mock("../api.js", () => ({ searchGet: vi.fn() }))
vi.mock("../auth.js", async importOriginal => ({
	...(await importOriginal()),
	getToken: async () => null,
}))

import { searchGet } from "../api.js"

afterEach(() => vi.unstubAllEnvs())

import { createServer } from "../server.js"

it("offers Free as a registry distribution filter", async () => {
	const server = createServer()
	const client = new Client({ name: "test", version: "1.0.0" })
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair()
	try {
		await server.connect(serverTransport)
		await client.connect(clientTransport)
		const { tools } = await client.listTools()
		const search = tools.find(tool => tool.name === "lpm_search")
		expect(search.inputSchema.properties.distribution.enum).toContain("free")
	} finally {
		await client.close()
		await server.close()
	}
})

it.each([
	{ distribution: "free" },
	{ ecosystem: "swift" },
])("browses with a structured filter alone: %j", async filter => {
	vi.stubEnv("LPM_TOKEN", "")
	searchGet.mockResolvedValue({ ok: true, data: { packages: [] } })
	const server = createServer()
	const client = new Client({ name: "test", version: "1.0.0" })
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair()
	try {
		await server.connect(serverTransport)
		await client.connect(clientTransport)
		const result = await client.callTool({
			name: "lpm_search",
			arguments: filter,
		})
		expect(result.isError).not.toBe(true)
		const [key, value] = Object.entries(filter)[0]
		expect(searchGet).toHaveBeenCalledWith(
			expect.stringContaining(`${key}=${value}`),
			null,
			expect.any(String),
		)
	} finally {
		await client.close()
		await server.close()
	}
})
