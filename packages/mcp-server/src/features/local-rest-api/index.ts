import { encodeVaultPath, makeRequest, type ToolRegistry } from "$/shared";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { type } from "arktype";
import { LocalRestAPI } from "shared";

/**
 * PATCH headers for Local REST API 5.x "raw-content mode" (markdown-patch 2.x): instruction
 * in headers, raw content in the body. The version header is mandatory — without it 5.x
 * answers 400 / 40084. We stay off the deprecated 1.x format (sunset in 6.0) because it
 * glues appended content onto the following heading line; 2.x owns the whitespace.
 *
 * 2.x takes heading targets as a percent-encoded JSON array and ignores Target-Delimiter /
 * Trim-Target-Whitespace, so the tool's `::`-path and trim options are applied here.
 */
export function patchRequest(
  args: typeof LocalRestAPI.ApiPatchParameters.infer,
): RequestInit {
  const trim = (s: string) => (args.trimTargetWhitespace ? s.trim() : s);
  let target: string;
  if (args.targetType === "heading") {
    const path = args.target.split(args.targetDelimiter || "::").map(trim);
    target = encodeURIComponent(JSON.stringify(path));
  } else {
    // Block ids / frontmatter keys go plain, percent-encoded only if non-ASCII.
    target = trim(args.target);
    if (/[^\x20-\x7e]/.test(target)) target = encodeURIComponent(target);
  }

  const headers: Record<string, string> = {
    Operation: args.operation,
    "Target-Type": args.targetType,
    Target: target,
    "Markdown-Patch-Version": "2",
  };
  if (args.createTargetIfMissing) headers["Create-Target-If-Missing"] = "true";

  // 2.x requires frontmatter values as JSON. 1.x stored a markdown body as a plain string,
  // so keep that: non-JSON frontmatter content becomes a JSON string.
  let body = args.content;
  if (args.targetType === "frontmatter" && args.contentType !== "application/json") {
    body = JSON.stringify(args.content);
    headers["Content-Type"] = "application/json";
  } else if (args.contentType) {
    headers["Content-Type"] = args.contentType;
  }
  return { method: "PATCH", headers, body };
}

function periodicPath(args: {
  period: string;
  year?: number;
  month?: number;
  day?: number;
}): string {
  if (
    args.year !== undefined &&
    args.month !== undefined &&
    args.day !== undefined
  ) {
    return `/periodic/${args.period}/${args.year}/${args.month}/${args.day}/`;
  }
  return `/periodic/${args.period}/`;
}

const PeriodicNoteParams = {
  period: '"daily" | "weekly" | "monthly" | "quarterly" | "yearly"' as const,
  "year?": "number" as const,
  "month?": "number" as const,
  "day?": "number" as const,
};

export function registerLocalRestApiTools(tools: ToolRegistry, server: Server) {
  // GET Status
  tools.register(
    type({
      name: '"get_server_info"',
      arguments: "Record<string, unknown>",
    }).describe(
      "Returns basic details about the Obsidian Local REST API and authentication status. This is the only API request that does not require authentication.",
    ),
    async () => {
      const data = await makeRequest(LocalRestAPI.ApiStatusResponse, "/");
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  // GET Active File
  tools.register(
    type({
      name: '"get_active_file"',
      arguments: {
        format: type('"markdown" | "json"').optional(),
      },
    }).describe(
      "Returns the content of the currently active file in Obsidian. Can return either markdown content or a JSON representation including parsed tags and frontmatter.",
    ),
    async ({ arguments: args }) => {
      const format =
        args?.format === "json"
          ? "application/vnd.olrapi.note+json"
          : "text/markdown";
      const data = await makeRequest(
        LocalRestAPI.ApiNoteJson.or("string"),
        "/active/",
        {
          headers: { Accept: format },
        },
      );
      const content =
        typeof data === "string" ? data : JSON.stringify(data, null, 2);
      return { content: [{ type: "text", text: content }] };
    },
  );

  // PUT Active File
  tools.register(
    type({
      name: '"update_active_file"',
      arguments: {
        content: "string",
      },
    }).describe("Update the content of the active file open in Obsidian."),
    async ({ arguments: args }) => {
      await makeRequest(LocalRestAPI.ApiNoContentResponse, "/active/", {
        method: "PUT",
        body: args.content,
      });
      return {
        content: [{ type: "text", text: "File updated successfully" }],
      };
    },
  );

  // POST Active File
  tools.register(
    type({
      name: '"append_to_active_file"',
      arguments: {
        content: "string",
      },
    }).describe("Append content to the end of the currently-open note."),
    async ({ arguments: args }) => {
      await makeRequest(LocalRestAPI.ApiNoContentResponse, "/active/", {
        method: "POST",
        body: args.content,
      });
      return {
        content: [{ type: "text", text: "Content appended successfully" }],
      };
    },
  );

  // PATCH Active File
  tools.register(
    type({
      name: '"patch_active_file"',
      arguments: LocalRestAPI.ApiPatchParameters,
    }).describe(
      "Insert or modify content in the currently-open note relative to a heading, block reference, or frontmatter field.",
    ),
    async ({ arguments: args }) => {

      const response = await makeRequest(
        LocalRestAPI.ApiContentResponse,
        "/active/",
        patchRequest(args),
      );
      return {
        content: [
          { type: "text", text: "File patched successfully" },
          { type: "text", text: response },
        ],
      };
    },
  );

  // DELETE Active File
  tools.register(
    type({
      name: '"delete_active_file"',
      arguments: "Record<string, unknown>",
    }).describe("Delete the currently-active file in Obsidian."),
    async () => {
      await makeRequest(LocalRestAPI.ApiNoContentResponse, "/active/", {
        method: "DELETE",
      });
      return {
        content: [{ type: "text", text: "File deleted successfully" }],
      };
    },
  );

  // POST Open File in Obsidian UI
  tools.register(
    type({
      name: '"show_file_in_obsidian"',
      arguments: {
        filename: "string",
        "newLeaf?": "boolean",
      },
    }).describe(
      "Open a document in the Obsidian UI. Creates a new document if it doesn't exist. Returns a confirmation if the file was opened successfully.",
    ),
    async ({ arguments: args }) => {
      const query = args.newLeaf ? "?newLeaf=true" : "";

      await makeRequest(
        LocalRestAPI.ApiNoContentResponse,
        `/open/${encodeVaultPath(args.filename)}${query}`,
        {
          method: "POST",
        },
      );

      return {
        content: [{ type: "text", text: "File opened successfully" }],
      };
    },
  );

  // POST Search via JsonLogic (Local REST API 5.1+ dropped Dataview DQL)
  tools.register(
    type({
      name: '"search_vault"',
      arguments: {
        "queryType?": type('"jsonlogic"').describe(
          'Only "jsonlogic" is supported; Dataview DQL was removed in Local REST API 5.1',
        ),
        query: type("string").describe(
          'A JsonLogic query evaluated against each note (fields: path, content, frontmatter, tags, stat). Supports "glob" and "regexp" operators, e.g. {"glob": ["Projects/*", {"var": "path"}]}',
        ),
      },
    }).describe("Search for documents matching a JsonLogic query."),
    async ({ arguments: args }) => {
      const data = await makeRequest(
        LocalRestAPI.ApiSearchResponse,
        "/search/",
        {
          method: "POST",
          headers: { "Content-Type": "application/vnd.olrapi.jsonlogic+json" },
          body: args.query,
        },
      );

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  // POST Simple Search
  tools.register(
    type({
      name: '"search_vault_simple"',
      arguments: {
        query: "string",
        "contextLength?": "number",
        "maxResults?": type("number.integer > 0").describe(
          "Keep only the highest-scoring files (default 20)",
        ),
        "maxMatchesPerFile?": type("number.integer > 0").describe(
          "Keep the first N matches in each file (default 10)",
        ),
      },
    }).describe(
      "Search for documents matching a text query. Each word matches separately; results are capped by maxResults/maxMatchesPerFile, and each result's totalMatches shows what was left out.",
    ),
    async ({ arguments: args }) => {
      // Uncapped, a common word can return tens of MB (the REST API has no default limit).
      const query = new URLSearchParams({
        query: args.query,
        maxResults: String(args.maxResults ?? 20),
        maxMatchesPerFile: String(args.maxMatchesPerFile ?? 10),
        ...(args.contextLength
          ? {
              contextLength: String(args.contextLength),
            }
          : {}),
      });

      const data = await makeRequest(
        LocalRestAPI.ApiSimpleSearchResponse,
        `/search/simple/?${query}`,
        {
          method: "POST",
        },
      );

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  // GET Vault Files or Directories List
  tools.register(
    type({
      name: '"list_vault_files"',
      arguments: {
        "directory?": "string",
      },
    }).describe(
      "List files in the root directory or a specified subdirectory of your vault.",
    ),
    async ({ arguments: args }) => {
      const path = args.directory
        ? `${encodeVaultPath(args.directory.replace(/\/$/, ""))}/`
        : "";
      const data = await makeRequest(
        LocalRestAPI.ApiVaultFileResponse.or(
          LocalRestAPI.ApiVaultDirectoryResponse,
        ),
        `/vault/${path}`,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  // GET Vault File Content
  tools.register(
    type({
      name: '"get_vault_file"',
      arguments: {
        filename: "string",
        "format?": '"markdown" | "json"',
      },
    }).describe("Get the content of a file from your vault."),
    async ({ arguments: args }) => {
      const isJson = args.format === "json";
      const format = isJson
        ? "application/vnd.olrapi.note+json"
        : "text/markdown";
      const data = await makeRequest(
        isJson ? LocalRestAPI.ApiNoteJson : LocalRestAPI.ApiContentResponse,
        `/vault/${encodeVaultPath(args.filename)}`,
        {
          headers: { Accept: format },
        },
      );
      return {
        content: [
          {
            type: "text",
            text:
              typeof data === "string" ? data : JSON.stringify(data, null, 2),
          },
        ],
      };
    },
  );

  // PUT Vault File Content
  tools.register(
    type({
      name: '"create_vault_file"',
      arguments: {
        filename: "string",
        content: "string",
      },
    }).describe("Create a new file in your vault or update an existing one."),
    async ({ arguments: args }) => {
      await makeRequest(
        LocalRestAPI.ApiNoContentResponse,
        `/vault/${encodeVaultPath(args.filename)}`,
        {
          method: "PUT",
          body: args.content,
        },
      );
      return {
        content: [{ type: "text", text: "File created successfully" }],
      };
    },
  );

  // POST Vault File Content
  tools.register(
    type({
      name: '"append_to_vault_file"',
      arguments: {
        filename: "string",
        content: "string",
      },
    }).describe("Append content to a new or existing file."),
    async ({ arguments: args }) => {
      await makeRequest(
        LocalRestAPI.ApiNoContentResponse,
        `/vault/${encodeVaultPath(args.filename)}`,
        {
          method: "POST",
          body: args.content,
        },
      );
      return {
        content: [{ type: "text", text: "Content appended successfully" }],
      };
    },
  );

  // PATCH Vault File Content
  tools.register(
    type({
      name: '"patch_vault_file"',
      arguments: type({
        filename: "string",
      }).and(LocalRestAPI.ApiPatchParameters),
    }).describe(
      "Insert or modify content in a file relative to a heading, block reference, or frontmatter field.",
    ),
    async ({ arguments: args }) => {

      const response = await makeRequest(
        LocalRestAPI.ApiContentResponse,
        `/vault/${encodeVaultPath(args.filename)}`,
        patchRequest(args),
      );

      return {
        content: [
          { type: "text", text: "File patched successfully" },
          { type: "text", text: response },
        ],
      };
    },
  );

  // DELETE Vault File Content
  tools.register(
    type({
      name: '"delete_vault_file"',
      arguments: {
        filename: "string",
      },
    }).describe("Delete a file from your vault."),
    async ({ arguments: args }) => {
      await makeRequest(
        LocalRestAPI.ApiNoContentResponse,
        `/vault/${encodeVaultPath(args.filename)}`,
        {
          method: "DELETE",
        },
      );
      return {
        content: [{ type: "text", text: "File deleted successfully" }],
      };
    },
  );

  // GET Periodic Note
  tools.register(
    type({
      name: '"get_periodic_note"',
      arguments: {
        ...PeriodicNoteParams,
        "format?": '"markdown" | "json"',
      },
    }).describe(
      "Returns the content of a periodic note (daily, weekly, monthly, quarterly, or yearly). When year/month/day are all provided, targets that specific date's note; otherwise targets the current period's note.",
    ),
    async ({ arguments: args }) => {
      const format =
        args.format === "json"
          ? "application/vnd.olrapi.note+json"
          : "text/markdown";
      const data = await makeRequest(
        LocalRestAPI.ApiNoteJson.or("string"),
        periodicPath(args),
        {
          headers: { Accept: format },
        },
      );
      const content =
        typeof data === "string" ? data : JSON.stringify(data, null, 2);
      return { content: [{ type: "text", text: content }] };
    },
  );

  // PUT Periodic Note
  tools.register(
    type({
      name: '"update_periodic_note"',
      arguments: {
        ...PeriodicNoteParams,
        content: "string",
      },
    }).describe(
      "Update the content of a periodic note. When year/month/day are all provided, targets that specific date's note; otherwise targets the current period's note.",
    ),
    async ({ arguments: args }) => {
      await makeRequest(
        LocalRestAPI.ApiNoContentResponse,
        periodicPath(args),
        {
          method: "PUT",
          body: args.content,
        },
      );
      return {
        content: [{ type: "text", text: "Periodic note updated successfully" }],
      };
    },
  );

  // POST Periodic Note
  tools.register(
    type({
      name: '"append_to_periodic_note"',
      arguments: {
        ...PeriodicNoteParams,
        content: "string",
      },
    }).describe(
      "Append content to a periodic note. When year/month/day are all provided, targets that specific date's note; otherwise targets the current period's note.",
    ),
    async ({ arguments: args }) => {
      await makeRequest(
        LocalRestAPI.ApiNoContentResponse,
        periodicPath(args),
        {
          method: "POST",
          body: args.content,
        },
      );
      return {
        content: [
          { type: "text", text: "Content appended to periodic note successfully" },
        ],
      };
    },
  );

  // PATCH Periodic Note
  tools.register(
    type({
      name: '"patch_periodic_note"',
      arguments: type(PeriodicNoteParams).and(LocalRestAPI.ApiPatchParameters),
    }).describe(
      "Insert or modify content in a periodic note relative to a heading, block reference, or frontmatter field. When year/month/day are all provided, targets that specific date's note; otherwise targets the current period's note.",
    ),
    async ({ arguments: args }) => {

      const response = await makeRequest(
        LocalRestAPI.ApiContentResponse,
        periodicPath(args),
        patchRequest(args),
      );
      return {
        content: [
          { type: "text", text: "Periodic note patched successfully" },
          { type: "text", text: response },
        ],
      };
    },
  );

  // DELETE Periodic Note
  tools.register(
    type({
      name: '"delete_periodic_note"',
      arguments: PeriodicNoteParams,
    }).describe(
      "Delete a periodic note. When year/month/day are all provided, targets that specific date's note; otherwise targets the current period's note.",
    ),
    async ({ arguments: args }) => {
      await makeRequest(
        LocalRestAPI.ApiNoContentResponse,
        periodicPath(args),
        {
          method: "DELETE",
        },
      );
      return {
        content: [{ type: "text", text: "Periodic note deleted successfully" }],
      };
    },
  );

  // GET Commands List
  tools.register(
    type({
      name: '"list_commands"',
      arguments: "Record<string, unknown>",
    }).describe(
      "List all available Obsidian commands. Returns command IDs and names that can be used with execute_command.",
    ),
    async () => {
      const data = await makeRequest(
        LocalRestAPI.ApiCommandsResponse,
        "/commands/",
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  // POST Execute Command
  tools.register(
    type({
      name: '"execute_command"',
      arguments: {
        commandId: "string",
      },
    }).describe(
      "Execute an Obsidian command by its ID. Use list_commands to discover available commands.",
    ),
    async ({ arguments: args }) => {
      await makeRequest(
        LocalRestAPI.ApiNoContentResponse,
        `/commands/${encodeURIComponent(args.commandId)}/`,
        {
          method: "POST",
        },
      );
      return {
        content: [{ type: "text", text: `Command "${args.commandId}" executed successfully` }],
      };
    },
  );
}
