import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { expect, it } from "vitest"

const manifest = JSON.parse(
	readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
)
const require = createRequire(import.meta.url)

// The SDK's exports map sends package.json to a nested build manifest.
function sdkManifest() {
	let directory = path.dirname(
		require.resolve("@modelcontextprotocol/sdk/server/mcp.js"),
	)
	for (;;) {
		try {
			const candidate = JSON.parse(
				readFileSync(path.join(directory, "package.json"), "utf8"),
			)
			if (candidate.name === "@modelcontextprotocol/sdk") return candidate
		} catch {}
		const parent = path.dirname(directory)
		if (parent === directory) throw new Error("MCP SDK manifest not found")
		directory = parent
	}
}

// LPM CLI releases before 0.86.0 install this package for `lpm mcp serve`.
// The LPM CLI's linker refuses a peer that has two installed versions, and
// the MCP SDK takes zod as both a dependency and a peer: a narrower zod range
// here resolves a second zod, and the install fails.
it("asks for zod with the range the MCP SDK asks for", () => {
	const sdk = sdkManifest()
	expect(sdk.peerDependencies.zod).toBe(sdk.dependencies.zod)
	expect(manifest.dependencies.zod).toBe(sdk.dependencies.zod)
})
