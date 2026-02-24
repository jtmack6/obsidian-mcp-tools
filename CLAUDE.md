# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP Tools for Obsidian is a secure bridge between Claude Desktop and Obsidian vaults via the Model Context Protocol (MCP). It consists of two components:
- **Obsidian Plugin** (`packages/obsidian-plugin/`) - Svelte + TypeScript UI running in Obsidian
- **MCP Server** (`packages/mcp-server/`) - Standalone executable handling MCP protocol

## Commands

### Root Level
```bash
bun install          # Install all workspaces
bun run check        # Type check all packages (tsc --noEmit)
bun run dev          # Development mode with file watching
bun run release      # Build all packages for release
bun run version      # Version management (bun scripts/version.ts)
```

### MCP Server (`packages/mcp-server/`)
```bash
bun run dev          # Watch mode, outputs to ../../bin/mcp-server
bun run build        # Single platform build to dist/mcp-server
bun run test         # Run tests (bun test ./src/**/*.test.ts)
bun run inspector    # MCP Inspector for debugging
bun run release      # Cross-platform builds (linux, mac-arm64, mac-x64, windows)
```

### Obsidian Plugin (`packages/obsidian-plugin/`)
```bash
bun run dev          # Watch mode development
bun run build        # Type check then build via bun.config.ts
bun run link         # Symlink for local development
```

## Architecture

### Monorepo Structure
```
packages/
├── mcp-server/      # MCP protocol server (compiles to executables)
├── obsidian-plugin/ # Obsidian plugin (TypeScript + Svelte 5)
└── shared/          # Shared utilities, types, logging
```

### Feature-Based Architecture
Both packages use self-contained feature modules in `src/features/`. Each feature follows:
```
feature/
├── components/     # UI components (Svelte for plugin)
├── services/       # Business logic
├── types.ts        # Feature-specific interfaces
├── utils.ts        # Helper functions
├── constants.ts    # Configuration constants
└── index.ts        # Public API + setup function
```

### Key Patterns

**Setup Functions** - Each feature exports `setup(plugin)` returning `{success: true|false, error?}`:
```typescript
type SetupResult = {success: true} | {success: false, error: string}
```

**Module Augmentation** - Features extend `McpToolsPluginSettings` via `declare module`

**Type Validation** - ArkType validates external data:
```typescript
const result = schema(untrustedData);
if (result instanceof type.errors) {
  // Use result.summary for error messages
}
```

**Tool Registry** - MCP server registers tools in a central registry with dispatch mechanism

### Tech Stack
- **Runtime:** Bun v1.1.42+
- **Language:** TypeScript (strict mode required)
- **UI:** Svelte 5+ with preprocessing
- **Validation:** ArkType for runtime type validation
- **MCP:** @modelcontextprotocol/sdk v1.0.4

## Conventions

- TypeScript strict mode required
- Prefer functional programming over OOP
- Shared code goes in `packages/shared/`
- Run `bun run check` before committing
- Tests use `.test.ts` extension alongside implementation files

## Version Management

Unified versioning across plugin and server. Run `bun run version [patch|minor|major]` to update all manifests and create a commit.

## MCP Tools

The server exposes 23 tools across 4 feature modules:

| Feature | Tools | Required Plugin |
|---------|-------|-----------------|
| **Fetch** | `fetch` | None |
| **Local REST API** | `get_server_info`, `get_active_file`, `update_active_file`, `append_to_active_file`, `patch_active_file`, `delete_active_file`, `show_file_in_obsidian`, `list_vault_files`, `get_vault_file`, `create_vault_file`, `append_to_vault_file`, `patch_vault_file`, `delete_vault_file`, `search_vault`, `search_vault_simple`, `get_periodic_note`, `update_periodic_note`, `append_to_periodic_note`, `patch_periodic_note`, `delete_periodic_note` | Local REST API |
| **Smart Connections** | `search_vault_smart` | Smart Connections |
| **Templater** | `execute_template` | Templater |

Tool implementations live in `packages/mcp-server/src/features/`. Each tool is registered via `ToolRegistry` using ArkType schemas.

## Testing

### Unit Tests
Tests use `bun:test` with colocated `.test.ts` files. Run from `packages/mcp-server/`:
```bash
bun run test         # bun test ./src/**/*.test.ts
```

Test infrastructure:
- **`src/shared/test-utils.ts`** — Shared harness: `mockResponse()`, `mock204()`, `mockErrorResponse()`, `createTestHarness()` (mocks `globalThis.fetch`, provides `dispatch()`, `getLastFetch()`, `getFetchCalls()`)
- Tests exercise the full tool chain via `ToolRegistry.dispatch()`: argument validation → request construction → response parsing → ArkType validation

Test files (~71 tests total):
| File | Coverage |
|------|----------|
| `src/shared/makeRequest.test.ts` | HTTP layer: auth headers, URL construction, JSON/text parsing, errors, 204 |
| `src/features/local-rest-api/index.test.ts` | All 20 Local REST API tools |
| `src/features/fetch/index.test.ts` | Fetch tool: markdown conversion, raw mode, pagination |
| `src/features/smart-connections/index.test.ts` | Smart search: POST body, filters, results |
| `src/features/templates/index.test.ts` | Template execution: two-phase fetch, boolean coercion |

### Integration Testing

#### Required Obsidian Plugins
- **Local REST API** - Core vault operations (required for most tools)
- **Smart Connections** - Semantic search
- **Templater** - Template execution
- **Dataview** - Advanced search queries

#### Claude Desktop Configuration
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "obsidian-mcp-tools": {
      "command": "/path/to/obsidian-mcp-tools/bin/mcp-server",
      "env": {
        "OBSIDIAN_API_KEY": "your-api-key-from-local-rest-api"
      }
    }
  }
}
```

#### MCP Inspector
Use `bun run inspector` in `packages/mcp-server/` to test tools interactively via web UI.

### Debug Logging
```bash
DEBUG=obsidian-mcp-tools:* bun run dev
```
