#!/usr/bin/env node

// CRITICAL: Never use console.log() — stdout is the MCP JSON-RPC transport
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createServer } from "../lib/server.js"

const server = createServer()
const transport = new StdioServerTransport()
await server.connect(transport)

console.error("LPM MCP server started")
