# [BUG] `patch_vault_file` heading-append created a duplicate heading at EOF and corrupted unrelated prose

> Draft bug report, written from a real incident on 2026-06-05. Two distinct problems are described; **Finding 1** is traced to code in this repo, **Finding 2** is observed-but-unexplained and needs a maintainer repro. File it as one issue or split into two.

## Bug Description

A single `patch_vault_file` call (`operation: append`, `targetType: heading`, `target: "Prerequisites"`) on a long note did two unexpected things:

1. **Wrong insertion point + duplicate heading.** Instead of appending under the existing `### Prerequisites` subsection, it created a **new `# Prerequisites` (H1) heading at the very end of the file** and put the content there — leaving the note with two "Prerequisites" headings and the new section orphaned at EOF.
2. **Corruption of unrelated prose far from the edit.** A line ~80 lines *above* the edit target — `See [[chezmoi.run]] for the broader MOC.` — was rewritten into two paraphrased sentences:
   > This is a reference to another note called "chezmoi.run" that serves as a main overview or hub for related information on that topic.
   >
   > In simpler terms: Look at that other page if you want to see the bigger picture or main index for this subject.
   The `[[chezmoi.run]]` wikilink was destroyed in the process. This was confirmed on disk (not just in the tool's echoed response).

Both were verified by reading the file directly off disk afterward, then fixed by hand with filesystem tools.

## Environment

- **OS**: macOS 26.6 (Darwin 25.6.0)
- **Obsidian version**: _TODO (fill in)_
- **Client**: Claude Code (CLI) over MCP — **not** Claude Desktop
- **Plugin version**: 0.2.33 (`manifest.json` — "MCP Tools (jtmack fork)")
- **Required plugins status**:
  - [x] Local REST API installed and configured (the PATCH reached it)
  - [ ] Smart Connections
  - [ ] Templater

## Steps to Reproduce

1. Have a note with an `H3` heading (`### Prerequisites`) nested under an `H2` (`## The runtime tooling …`), and an earlier line containing a `[[wikilink]]`.
2. Call `patch_vault_file` with:
   - `operation: "append"`
   - `targetType: "heading"`
   - `target: "Prerequisites"`  ← bare leaf name, **not** the full delimiter path
   - `contentType: "text/markdown"`
   - `content`: a chunk beginning with `## …` headings
3. Inspect the file on disk.

## Expected Behavior

Either:
- Append the content under the existing `### Prerequisites` section, **or**
- If the bare target can't be matched, **fail with an error** so the caller can correct the target — not silently invent a new heading and append at EOF.

And under no circumstances should content **elsewhere in the document** be altered.

## Actual Behavior

- New `# Prerequisites` heading appended at end of file; content inserted there; original `### Prerequisites` left untouched but now duplicated.
- The `[[chezmoi.run]]` line near the top was replaced with LLM-style paraphrase, losing the link.

## Finding 1 — hardcoded `Create-Target-If-Missing: "true"` (traced to this repo)

All three patch handlers force target-creation on, and the tool's parameter schema gives the caller no way to turn it off:

- `packages/mcp-server/src/features/local-rest-api/index.ts:125` (`patch_active_file`)
- `packages/mcp-server/src/features/local-rest-api/index.ts:386` (`patch_vault_file`)
- `packages/mcp-server/src/features/local-rest-api/index.ts:536` (`patch_periodic_note`)

```ts
const headers: HeadersInit = {
  Operation: args.operation,
  "Target-Type": args.targetType,
  Target: args.target,
  "Create-Target-If-Missing": "true",   // <-- always on, not caller-controllable
};
```

`ApiPatchParameters` (`packages/shared/src/types/plugin-local-rest-api.ts:209`) has no `createTargetIfMissing` field, so a caller cannot opt out.

**Why this produced the symptom:** the Local REST API heading matcher resolves `Target` as a delimiter path (`Target-Delimiter`, default `::`). A bare `"Prerequisites"` does not match a heading that is *nested* (the actual path was `The runtime tooling — secrets.fish::Prerequisites`). With no match **and** `Create-Target-If-Missing: "true"`, the downstream plugin creates the heading and appends — silently. The destructive default turns an easy caller mistake (passing a leaf instead of a full path) into a malformed document with a duplicate heading, no error surfaced.

### Suggested fix

- Expose `createTargetIfMissing?: boolean` in `ApiPatchParameters` and only send the header when explicitly `true`; **default to false/omitted** so a non-matching target returns the plugin's 404/400 instead of mutating the file.
- Tighten the `target` description to make clear that nested headings require the **full delimiter path**, not a leaf name.

## Finding 2 — unrelated prose/wikilink rewrite (observed, root cause NOT confirmed)

I could **not** attribute this to code in this repo. The MCP server handler only forwards the PATCH (method + headers + body) to the Local REST API plugin and returns its response; it does not parse or rewrite document body. So the paraphrasing must originate **downstream** — candidates, none verified:

- The Local REST API plugin re-serializing the whole note when it creates a missing heading, via a renderer that doesn't round-trip `[[wikilinks]]` verbatim. (Re-serialization could explain *structural* drift, but **not** LLM-style paraphrase text.)
- A different vault plugin that post-processes notes on modify/save (e.g., an AI/annotation plugin) reacting to the write.

The paraphrase wording strongly implies an LLM touched the file, which no code path in *this* repo does. **Action requested:** a maintainer repro on a clean vault (only Local REST API enabled) to determine whether the heading-create path alone can mutate unrelated content, or whether another plugin is implicated. If it cannot be reproduced without extra plugins, this half is likely environmental and not an obsidian-mcp-tools bug — but the data-loss severity warrants confirming.

## Additional Context

- The note was ~250 lines, mixed headings/tables/code fences, with `[[wikilinks]]`.
- Incident happened mid-session while documenting unrelated work; the file was hand-repaired immediately after (link restored, duplicate heading removed, section re-placed under the correct heading).

## Troubleshooting Attempted

- [ ] Restarted Obsidian
- [ ] Restarted client
- [ ] Reinstalled the MCP server
- [x] Read the file off disk to confirm corruption was persisted (not just echoed)
- [x] Traced the MCP-server code path for all three patch tools
- [ ] Clean-vault repro with only Local REST API enabled — **TODO (needed for Finding 2)**
