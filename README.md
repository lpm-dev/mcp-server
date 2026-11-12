# @lpm-registry/mcp-server

**This package is retired and gets no more updates.**
The LPM CLI serves MCP itself from version 0.86.0, as `lpm mcp serve`.
It has the current LPM.dev Registry tools and tools that install, add, and audit packages in your projects.

## Move to `lpm mcp serve`

Upgrade the LPM CLI to 0.86.0 or later, for example with `lpm self-update`. Then point your editors at its server:

```bash
lpm mcp setup
```

Restart your editors.
`lpm mcp setup` writes the server entry named `lpm-registry`, the name earlier setups and this README used, so it replaces that entry.
Remove an entry you named differently with `lpm mcp remove <name>`, and edit project files such as `.vscode/mcp.json` by hand.
See [MCP servers](https://cli.lpm.dev/docs/reference/mcp-servers) in the LPM CLI documentation.

To use the registry tools without the LPM CLI, connect your MCP client to `https://lpm.dev/mcp`.
It signs you in through LPM.dev in your browser. See [the LPM.dev MCP server](https://lpm.dev/docs/ai/mcp).

## What this last version does

Editors may still start this package, for example through `npx -y @lpm-registry/mcp-server@latest`.

- If it finds LPM CLI 0.86.0 or later, it starts `lpm mcp serve` in its place, and the editor gets the LPM CLI's server.
  It looks for the CLI at `LPM_CLI_PATH`, or as `lpm` on `PATH` outside the current project.
- Otherwise it serves the tools of earlier versions, and tells the editor's agent that it is retired.
  `lpm mcp serve` in LPM CLI releases before 0.86.0 runs this package, so those releases keep working until you upgrade.

## Renamed tools

The LPM CLI's server combines some tools:

| Earlier tools | Now |
| --- | --- |
| `lpm_package_info`, `lpm_quality_report`, `lpm_marketplace_info`, `lpm_api_docs`, `lpm_llm_context`, `lpm_package_context` | `lpm_package` |
| `lpm_search_owners`, `lpm_packages_by_owner` | `lpm_owner` |
| `lpm_user_info`, `lpm_pool_stats` | `lpm_account` |

`lpm_search`, `lpm_package_skills`, `lpm_browse_source`, `lpm_docs`, `lpm_install`, `lpm_add`, and `lpm_audit` keep their names.
`lpm_install`, `lpm_add`, and `lpm_audit` now take `projectPath`, the absolute path of the project's directory.

## License

ISC
