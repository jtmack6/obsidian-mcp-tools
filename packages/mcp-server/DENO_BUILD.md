# Building MCP Server with Deno (FreeBSD)

This document describes how to build the MCP server using Deno instead of Bun on FreeBSD.

## Why Deno?

Bun has compatibility issues on FreeBSD, particularly with ZFS filesystems through nullfs mounts. Deno provides:
- Native FreeBSD support
- Similar developer experience to Bun
- Standalone executable compilation via `deno compile`
- Active FreeBSD support in the community

## Prerequisites

- Deno 2.4.5 or later (install via `pkg install deno`)

## Building

### Quick Build

```bash
cd packages/mcp-server
./build-freebsd.sh
```

### Manual Build

```bash
cd packages/mcp-server

deno compile \
  --no-check \
  --allow-env \
  --allow-read \
  --allow-write \
  --allow-net \
  --allow-sys \
  --output dist/mcp-server-freebsd \
  src/index.ts
```

### Using Deno Tasks

```bash
cd packages/mcp-server
deno task build
```

## Changes Made for Deno Compatibility

### 1. Configuration Files

- **`deno.json`** (root): Workspace configuration with node-globals support
- **`packages/mcp-server/deno.json`**: Import maps and compilation settings

### 2. Import Path Updates

All imports now use explicit `.ts` extensions:
```typescript
// Before (Bun)
import { logger } from "$/shared";

// After (Deno)
import { logger } from "$/shared/index.ts";
```

### 3. Node.js Built-ins

Node.js built-in modules now use the `node:` prefix:
```typescript
// Before
import { existsSync } from "fs";

// After
import { existsSync } from "node:fs";
```

### 4. Macro Removal

Bun macros have been replaced with standard imports:
```typescript
// Before (Bun macro)
import { getVersion } from "./features/version" with { type: "macro" };

// After (Standard import)
import { getVersion } from "./features/version/index.ts";
```

### 5. Platform Support

Added FreeBSD case to the logger's `getLogFilePath` function in `packages/shared/src/logger.ts`.

## Testing

### Version Check

```bash
./dist/mcp-server-freebsd --version
```

Expected output: `0.2.27` (or current version)

### Full Test

Set required environment variables and run:
```bash
export OBSIDIAN_API_KEY="your-api-key-here"
./dist/mcp-server-freebsd
```

## Binary Details

- **Size**: ~297 MB
- **Type**: FreeBSD ELF 64-bit executable
- **Dependencies**: Standalone (all dependencies bundled)
- **Permissions Required**:
  - `--allow-env`: Environment variable access
  - `--allow-read`: File system read
  - `--allow-write`: File system write
  - `--allow-net`: Network access (for REST API)
  - `--allow-sys`: System info access (for homedir)

## Known Limitations

1. **Type Checking**: Compilation uses `--no-check` to skip type checking due to some HTMLRewriter API usage that's Bun-specific but doesn't affect runtime.

2. **HTMLRewriter**: The markdown conversion code uses HTMLRewriter which is available in Deno but has slightly different typing than Bun.

## Development

### Run in Development Mode

```bash
cd packages/mcp-server
deno task dev
```

### Type Check

```bash
deno task check
```

## Troubleshooting

### "Cannot find module" errors

Ensure all imports use explicit `.ts` extensions and proper paths.

### "NotCapable" permission errors

Add the required `--allow-*` flags to the compile command.

### "Unsupported operating system" errors

Check that FreeBSD case is included in `packages/shared/src/logger.ts`.

## Future Considerations

- Type checking: Fix HTMLRewriter types to enable full type checking
- Optimize binary size: Currently ~297MB, could potentially be reduced
- CI/CD: Add Deno build to GitHub Actions workflow
