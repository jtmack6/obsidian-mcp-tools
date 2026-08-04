# [BUG] All three `patch_*` tools fail with HTTP 400 against Local REST API 5.x — no `Markdown-Patch-Version` header sent

> Written from a real incident on 2026-08-03. Unlike
> [`BUG_patch_vault_file_corruption.md`](./BUG_patch_vault_file_corruption.md), this one is
> fully traced to code in this repo and has an unambiguous fix. **Current impact: every
> patch tool is completely broken** against the installed plugin — not degraded, not
> edge-case. Every call returns 400 and nothing is written.

## Bug Description

`patch_vault_file`, `patch_active_file` and `patch_periodic_note` all fail immediately.
The Local REST API plugin ("Local REST API with MCP" 5.0.3) now supports two mutually
incompatible PATCH formats and refuses to guess between them, so it requires an explicit
`Markdown-Patch-Version` request header. This repo never sends one.

Observed calling `patch_vault_file` to set a frontmatter field:

```
MCP error -32603: PATCH /vault/Projects/sh-01a-mcp/sh-01a-mcp.md 400: {
  "message": "Header-based PATCH targeting is ambiguous between the two patch formats, so
  it requires an explicit 'Markdown-Patch-Version' header: send '1' for the deprecated 1.x
  header-driven format, or '2' for raw-content mode (instruction fields in headers —
  heading Targets as percent-encoded JSON arrays — with the raw payload as the request
  body). The 1.x-only Target-Delimiter and Trim-Target-Whitespace headers are never
  processed under version 2.",
  "errorCode": 40084
}
```

The failure is clean — the plugin rejects before touching the file, so there's no data
loss. It's an availability bug, not a corruption one.

## Environment

- **OS**: macOS 27.0 (Darwin 27.0.0)
- **Client**: Claude Code (CLI) over MCP — **not** Claude Desktop
- **This plugin**: 0.2.34 (`manifest.json` — "MCP Tools (jtmack fork)")
- **Local REST API plugin**: **5.0.3** ("Local REST API with MCP") ← the moving part
- **Required plugins status**:
  - [x] Local REST API installed and configured (the PATCH reached it and was rejected)
  - [ ] Smart Connections
  - [ ] Templater

## Steps to Reproduce

1. Install "Local REST API with MCP" **5.0.3** (any 5.x that enforces `errorCode 40084`).
2. Call `patch_vault_file` with any valid arguments, e.g. `operation: "replace"`,
   `targetType: "frontmatter"`, `target: "status"`, `contentType: "application/json"`,
   `content: "\"active\""`.
3. Observe HTTP 400 / `errorCode 40084`. The file is unchanged.

Affects all three patch tools identically — the header block is duplicated in each.

## Expected Behavior

The patch applies, as it did against Local REST API 4.x.

## Actual Behavior

HTTP 400 with `errorCode 40084` on every call. No patch tool works at all.

## Root Cause (traced to this repo)

All three handlers construct the same header block and none includes
`Markdown-Patch-Version`. `grep -rn "Markdown-Patch-Version"` over the repo returns
nothing — the header is not referenced anywhere, in code, types or docs.

- `packages/mcp-server/src/features/local-rest-api/index.ts:121-138` (`patch_active_file`)
- `packages/mcp-server/src/features/local-rest-api/index.ts:386-403` (`patch_vault_file`)
- `packages/mcp-server/src/features/local-rest-api/index.ts:538-555` (`patch_periodic_note`)

```ts
const headers: HeadersInit = {
  Operation: args.operation,
  "Target-Type": args.targetType,
  Target: args.target,
  // <-- no Markdown-Patch-Version: the plugin now 400s rather than assume a format
};

if (args.createTargetIfMissing) {
  headers["Create-Target-If-Missing"] = "true";
}
if (args.targetDelimiter) {
  headers["Target-Delimiter"] = args.targetDelimiter;
}
if (args.trimTargetWhitespace !== undefined) {
  headers["Trim-Target-Whitespace"] = String(args.trimTargetWhitespace);
}
```

This was latent: 4.x defaulted to the 1.x format, so omitting the header worked. 5.x made
the ambiguity explicit and now rejects.

## Fix — implemented and verified

Applied in this repo: a shared `MARKDOWN_PATCH_VERSION = "1"` constant, sent from all
three header blocks. `make check` clean, `make test` 80/80.

**Verified against the live plugin (Local REST API 5.0.3)** with curl on a throwaway note,
same request twice with only the header differing:

```
WITHOUT the header:              HTTP 400, errorCode 40084
WITH Markdown-Patch-Version: 1:  HTTP 200   → frontmatter changed before → after
```

So the header alone is the whole fix; nothing else about the 1.x request shape needed to
change.

<details><summary>Original suggested fix (kept for the reasoning)</summary>

**Send `"Markdown-Patch-Version": "1"`** in all three header blocks. That selects the
format the existing code already speaks — header-driven targeting, `::`-delimited heading
paths, content in the body — so it is a one-line-per-handler change with no behavioural
difference and no schema change.

Note from the error text: **`Target-Delimiter` and `Trim-Target-Whitespace` are 1.x-only
and are silently ignored under version 2.** So the two tool parameters this repo exposes
for them are meaningful *only* under version 1. Pinning to `"1"` keeps them working;
moving to `"2"` later would mean percent-encoded JSON-array heading targets and dropping
(or reimplementing) those two parameters — a real migration, not a header swap. Don't
reach for `"2"` just because it's the higher number.

Worth considering alongside the fix:

- **Make the version a constant** (e.g. `const MARKDOWN_PATCH_VERSION = "1"`) rather than
  three string literals, since the three header blocks have already drifted apart once —
  that duplication is what let `BUG_patch_vault_file_corruption.md` land in all three.
- **Surface the plugin's error body to the caller.** The message here was genuinely
  actionable, and it did survive to the client, which is why this took minutes rather than
  a debugging session. Worth protecting in any refactor.
- **A compatibility check** — if the plugin exposes its version, failing loudly at startup
  ("Local REST API 5.x requires …") beats every tool call failing at use time.

</details>

## Additional Context

Hit while setting `status`/`next` frontmatter from a Claude Code skill. Anything routing
through `patch_vault_file` is affected — for this vault that's the `/focus`, `/snip` and
`/recap` skills. Workaround until fixed: write the file directly with filesystem tools,
which is what was done (the vault is local, so this is equivalent for frontmatter edits).

## Troubleshooting Attempted

- [ ] Restarted Obsidian
- [ ] Restarted client
- [ ] Reinstalled the MCP server
- [x] Confirmed the file was untouched on disk (clean rejection, no partial write)
- [x] Traced the header construction in all three patch handlers
- [x] Confirmed `Markdown-Patch-Version` appears nowhere in the repo
- [x] Recorded both plugin versions (fork 0.2.34, Local REST API 5.0.3)
- [x] Verified the fix by sending `Markdown-Patch-Version: 1` — 400 → 200, patch applied

### Gotcha while reproducing with curl

Percent-encode the vault path's **segments but not its slashes**. `GET /vault/A%2FB.md`
returns 404 (the plugin reads it as one filename containing slashes); `GET /vault/A/B.md`
returns 200. `encodeVaultPath()` already does this correctly — it only bites when you're
hand-rolling requests to reproduce, and a 404 there looks exactly like "note not indexed".
