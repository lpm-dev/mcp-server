#!/usr/bin/env node

// CRITICAL: Never use console.log() — stdout is the MCP JSON-RPC transport
import { RETIREMENT_NOTICE } from "../lib/constants.js"
import { exitLike, findNativeServer, runNativeServer } from "../lib/handoff.js"

// Nothing here may touch process.stdin before the hand-off: the CLI's server
// reads the client's first requests from the same stream.
const cli = await findNativeServer()
if (cli) {
	console.error(
		`@lpm-registry/mcp-server is retired. Starting ${cli} mcp serve instead; run \`lpm mcp setup\` so your editors start it directly.`,
	)
	const result = await runNativeServer(cli)
	if (result.started) exitLike(result)
	console.error(`Could not start ${cli}: ${result.error.message}`)
}

const { StdioServerTransport } = await import(
	"@modelcontextprotocol/sdk/server/stdio.js"
)
const { createServer } = await import("../lib/server.js")

const server = createServer()
const transport = new StdioServerTransport()
await server.connect(transport)

console.error(`LPM MCP server started. ${RETIREMENT_NOTICE}`)
