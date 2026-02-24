import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import {
  createTestHarness,
  mock204,
  mockErrorResponse,
  mockResponse,
} from "$/shared/test-utils";
import { BASE_URL } from "$/shared/makeRequest";
import { registerLocalRestApiTools } from "./index";

const originalApiKey = process.env.OBSIDIAN_API_KEY;

let harness: ReturnType<typeof createTestHarness>;

beforeAll(() => {
  process.env.OBSIDIAN_API_KEY = "test-api-key";
  harness = createTestHarness();
  registerLocalRestApiTools(harness.tools, harness.mockServer);
});

afterEach(() => {
  harness.clearFetchCalls();
});

afterAll(() => {
  harness.cleanup();
  if (originalApiKey !== undefined) {
    process.env.OBSIDIAN_API_KEY = originalApiKey;
  } else {
    delete process.env.OBSIDIAN_API_KEY;
  }
});

// ---------- Fixtures ----------

const statusResponse = {
  status: "OK",
  manifest: {
    id: "obsidian-local-rest-api",
    name: "Local REST API",
    version: "3.0.0",
    minAppVersion: "0.15.0",
    description: "REST API for Obsidian",
    author: "Test",
    authorUrl: "https://example.com",
    isDesktopOnly: true,
    dir: ".obsidian/plugins/obsidian-local-rest-api",
  },
  versions: { obsidian: "1.5.0", self: "3.0.0" },
  service: "Obsidian Local REST API",
  authenticated: true,
};

const noteJson = {
  content: "# Hello\nWorld",
  frontmatter: { title: "Hello" },
  path: "Hello.md",
  stat: { ctime: 1000, mtime: 2000, size: 100 },
  tags: ["test"],
};

const vaultFileResponse = {
  frontmatter: { tags: ["test"], description: "A test file" },
  content: "# Test\nContent",
  path: "test.md",
  stat: { ctime: 1000, mtime: 2000, size: 50 },
  tags: ["test"],
};

const searchResults = [
  { filename: "note.md", result: "matched text" },
];

const simpleSearchResults = [
  {
    filename: "note.md",
    matches: [{ match: { start: 0, end: 5 }, context: "hello world" }],
    score: 1.0,
  },
];

const directoryResponse = { files: ["note1.md", "note2.md", "subfolder/note3.md"] };

const commandsResponse = {
  commands: [
    { id: "app:go-back", name: "Navigate back" },
    { id: "editor:toggle-bold", name: "Toggle bold" },
    { id: "graph:open", name: "Open graph view" },
  ],
};

// ---------- Tests ----------

describe("get_server_info", () => {
  test("sends GET to /", async () => {
    harness.setFetchResponse(mockResponse(statusResponse));
    const result = await harness.dispatch("get_server_info");

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(`${BASE_URL}/`);
    expect(lastFetch.init?.method).toBeUndefined(); // defaults to GET
    expect(result.content[0].text).toContain("OK");
  });
});

describe("get_active_file", () => {
  test("sends markdown Accept header by default", async () => {
    harness.setFetchResponse(
      mockResponse("# My Note", { contentType: "text/markdown" }),
    );
    const result = await harness.dispatch("get_active_file", {});

    const headers = harness.getLastFetch()!.init?.headers as Record<string, string>;
    expect(headers.Accept).toBe("text/markdown");
    expect(result.content[0].text).toBe("# My Note");
  });

  test("sends JSON Accept header when format=json", async () => {
    harness.setFetchResponse(mockResponse(noteJson));
    const result = await harness.dispatch("get_active_file", { format: "json" });

    const headers = harness.getLastFetch()!.init?.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/vnd.olrapi.note+json");
    expect(result.content[0].text).toContain("Hello");
  });
});

describe("update_active_file", () => {
  test("sends PUT to /active/ with body", async () => {
    harness.setFetchResponse(mock204());
    await harness.dispatch("update_active_file", { content: "new content" });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(`${BASE_URL}/active/`);
    expect(lastFetch.init?.method).toBe("PUT");
    expect(lastFetch.init?.body).toBe("new content");
  });
});

describe("append_to_active_file", () => {
  test("sends POST to /active/ with body", async () => {
    harness.setFetchResponse(mock204());
    await harness.dispatch("append_to_active_file", { content: "appended" });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(`${BASE_URL}/active/`);
    expect(lastFetch.init?.method).toBe("POST");
    expect(lastFetch.init?.body).toBe("appended");
  });
});

describe("patch_active_file", () => {
  test("sends PATCH to /active/ with correct headers", async () => {
    harness.setFetchResponse(
      mockResponse("patched content", { contentType: "text/markdown" }),
    );
    await harness.dispatch("patch_active_file", {
      operation: "append",
      targetType: "heading",
      target: "Section 1",
      content: "new text",
    });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(`${BASE_URL}/active/`);
    expect(lastFetch.init?.method).toBe("PATCH");
    const headers = lastFetch.init?.headers as Record<string, string>;
    expect(headers.Operation).toBe("append");
    expect(headers["Target-Type"]).toBe("heading");
    expect(headers.Target).toBe("Section 1");
    expect(headers["Create-Target-If-Missing"]).toBe("true");
  });

  test("includes optional headers when provided", async () => {
    harness.setFetchResponse(
      mockResponse("patched content", { contentType: "text/markdown" }),
    );
    await harness.dispatch("patch_active_file", {
      operation: "replace",
      targetType: "frontmatter",
      target: "title",
      content: '{"title": "New"}',
      contentType: "application/json",
      targetDelimiter: "::",
      trimTargetWhitespace: true,
    });

    const headers = harness.getLastFetch()!.init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Target-Delimiter"]).toBe("::");
    expect(headers["Trim-Target-Whitespace"]).toBe("true");
  });
});

describe("delete_active_file", () => {
  test("sends DELETE to /active/", async () => {
    harness.setFetchResponse(mock204());
    const result = await harness.dispatch("delete_active_file");

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(`${BASE_URL}/active/`);
    expect(lastFetch.init?.method).toBe("DELETE");
    expect(result.content[0].text).toContain("deleted");
  });
});

describe("show_file_in_obsidian", () => {
  test("sends POST with URL-encoded filename", async () => {
    harness.setFetchResponse(mock204());
    await harness.dispatch("show_file_in_obsidian", {
      filename: "my folder/my note.md",
    });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(
      `${BASE_URL}/open/${encodeURIComponent("my folder/my note.md")}`,
    );
    expect(lastFetch.init?.method).toBe("POST");
  });

  test("adds newLeaf query param when true", async () => {
    harness.setFetchResponse(mock204());
    await harness.dispatch("show_file_in_obsidian", {
      filename: "note.md",
      newLeaf: true,
    });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toContain("?newLeaf=true");
  });
});

describe("search_vault", () => {
  test("sends dataview Content-Type for dataview queryType", async () => {
    harness.setFetchResponse(mockResponse(searchResults));
    await harness.dispatch("search_vault", {
      queryType: "dataview",
      query: 'TABLE file.name FROM "notes"',
    });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(`${BASE_URL}/search/`);
    expect(lastFetch.init?.method).toBe("POST");
    const headers = lastFetch.init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe(
      "application/vnd.olrapi.dataview.dql+txt",
    );
  });

  test("sends jsonlogic Content-Type for jsonlogic queryType", async () => {
    harness.setFetchResponse(mockResponse(searchResults));
    await harness.dispatch("search_vault", {
      queryType: "jsonlogic",
      query: '{"glob": ["*.md"]}',
    });

    const headers = harness.getLastFetch()!.init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe(
      "application/vnd.olrapi.jsonlogic+json",
    );
  });
});

describe("search_vault_simple", () => {
  test("sends POST with query param", async () => {
    harness.setFetchResponse(mockResponse(simpleSearchResults));
    await harness.dispatch("search_vault_simple", { query: "hello" });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toContain("/search/simple/");
    expect(lastFetch.url).toContain("query=hello");
    expect(lastFetch.init?.method).toBe("POST");
  });

  test("includes contextLength when provided", async () => {
    harness.setFetchResponse(mockResponse(simpleSearchResults));
    await harness.dispatch("search_vault_simple", {
      query: "hello",
      contextLength: 200,
    });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toContain("contextLength=200");
  });
});

describe("list_vault_files", () => {
  test("sends GET to /vault/ for root", async () => {
    harness.setFetchResponse(mockResponse(directoryResponse));
    await harness.dispatch("list_vault_files", {});

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(`${BASE_URL}/vault/`);
  });

  test("sends GET to /vault/subdir/ for subdirectory", async () => {
    harness.setFetchResponse(mockResponse(directoryResponse));
    await harness.dispatch("list_vault_files", { directory: "subfolder" });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(`${BASE_URL}/vault/subfolder/`);
  });
});

describe("get_vault_file", () => {
  test("sends GET with markdown Accept by default", async () => {
    harness.setFetchResponse(
      mockResponse("# Content", { contentType: "text/markdown" }),
    );
    await harness.dispatch("get_vault_file", { filename: "note.md" });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(
      `${BASE_URL}/vault/${encodeURIComponent("note.md")}`,
    );
    const headers = lastFetch.init?.headers as Record<string, string>;
    expect(headers.Accept).toBe("text/markdown");
  });

  test("sends JSON Accept when format=json", async () => {
    harness.setFetchResponse(mockResponse(noteJson));
    await harness.dispatch("get_vault_file", {
      filename: "note.md",
      format: "json",
    });

    const headers = harness.getLastFetch()!.init?.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/vnd.olrapi.note+json");
  });
});

describe("create_vault_file", () => {
  test("sends PUT with filename and content", async () => {
    harness.setFetchResponse(mock204());
    await harness.dispatch("create_vault_file", {
      filename: "new-note.md",
      content: "# New Note",
    });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(
      `${BASE_URL}/vault/${encodeURIComponent("new-note.md")}`,
    );
    expect(lastFetch.init?.method).toBe("PUT");
    expect(lastFetch.init?.body).toBe("# New Note");
  });
});

describe("append_to_vault_file", () => {
  test("sends POST with filename and content", async () => {
    harness.setFetchResponse(mock204());
    await harness.dispatch("append_to_vault_file", {
      filename: "note.md",
      content: "appended text",
    });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(
      `${BASE_URL}/vault/${encodeURIComponent("note.md")}`,
    );
    expect(lastFetch.init?.method).toBe("POST");
    expect(lastFetch.init?.body).toBe("appended text");
  });
});

describe("patch_vault_file", () => {
  test("sends PATCH with filename and patch headers", async () => {
    harness.setFetchResponse(
      mockResponse("updated content", { contentType: "text/markdown" }),
    );
    await harness.dispatch("patch_vault_file", {
      filename: "note.md",
      operation: "prepend",
      targetType: "block",
      target: "block-id",
      content: "prepended",
    });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(
      `${BASE_URL}/vault/${encodeURIComponent("note.md")}`,
    );
    expect(lastFetch.init?.method).toBe("PATCH");
    const headers = lastFetch.init?.headers as Record<string, string>;
    expect(headers.Operation).toBe("prepend");
    expect(headers["Target-Type"]).toBe("block");
    expect(headers.Target).toBe("block-id");
  });
});

describe("delete_vault_file", () => {
  test("sends DELETE with filename", async () => {
    harness.setFetchResponse(mock204());
    await harness.dispatch("delete_vault_file", { filename: "old.md" });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(
      `${BASE_URL}/vault/${encodeURIComponent("old.md")}`,
    );
    expect(lastFetch.init?.method).toBe("DELETE");
  });
});

// ---------- Periodic Note Tools ----------

describe("get_periodic_note", () => {
  test("sends GET to /periodic/{period}/ for current period", async () => {
    harness.setFetchResponse(
      mockResponse("# Daily Note", { contentType: "text/markdown" }),
    );
    const result = await harness.dispatch("get_periodic_note", {
      period: "daily",
    });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(`${BASE_URL}/periodic/daily/`);
    expect(lastFetch.init?.method).toBeUndefined();
    const headers = lastFetch.init?.headers as Record<string, string>;
    expect(headers.Accept).toBe("text/markdown");
    expect(result.content[0].text).toBe("# Daily Note");
  });

  test("sends GET to /periodic/{period}/{y}/{m}/{d}/ for specific date", async () => {
    harness.setFetchResponse(
      mockResponse("# Jan 15 Note", { contentType: "text/markdown" }),
    );
    await harness.dispatch("get_periodic_note", {
      period: "daily",
      year: 2026,
      month: 1,
      day: 15,
    });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(`${BASE_URL}/periodic/daily/2026/1/15/`);
  });

  test("sends JSON Accept header when format=json", async () => {
    harness.setFetchResponse(mockResponse(noteJson));
    await harness.dispatch("get_periodic_note", {
      period: "weekly",
      format: "json",
    });

    const headers = harness.getLastFetch()!.init?.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/vnd.olrapi.note+json");
  });
});

describe("update_periodic_note", () => {
  test("sends PUT to /periodic/{period}/ with body", async () => {
    harness.setFetchResponse(mock204());
    await harness.dispatch("update_periodic_note", {
      period: "daily",
      content: "new content",
    });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(`${BASE_URL}/periodic/daily/`);
    expect(lastFetch.init?.method).toBe("PUT");
    expect(lastFetch.init?.body).toBe("new content");
  });

  test("sends PUT to date-specific path when date provided", async () => {
    harness.setFetchResponse(mock204());
    await harness.dispatch("update_periodic_note", {
      period: "monthly",
      year: 2026,
      month: 2,
      day: 1,
      content: "monthly content",
    });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(`${BASE_URL}/periodic/monthly/2026/2/1/`);
    expect(lastFetch.init?.method).toBe("PUT");
  });
});

describe("append_to_periodic_note", () => {
  test("sends POST to /periodic/{period}/ with body", async () => {
    harness.setFetchResponse(mock204());
    await harness.dispatch("append_to_periodic_note", {
      period: "yearly",
      content: "appended",
    });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(`${BASE_URL}/periodic/yearly/`);
    expect(lastFetch.init?.method).toBe("POST");
    expect(lastFetch.init?.body).toBe("appended");
  });
});

describe("patch_periodic_note", () => {
  test("sends PATCH to /periodic/{period}/ with correct headers", async () => {
    harness.setFetchResponse(
      mockResponse("patched content", { contentType: "text/markdown" }),
    );
    await harness.dispatch("patch_periodic_note", {
      period: "daily",
      operation: "append",
      targetType: "heading",
      target: "Tasks",
      content: "- [ ] New task",
    });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(`${BASE_URL}/periodic/daily/`);
    expect(lastFetch.init?.method).toBe("PATCH");
    const headers = lastFetch.init?.headers as Record<string, string>;
    expect(headers.Operation).toBe("append");
    expect(headers["Target-Type"]).toBe("heading");
    expect(headers.Target).toBe("Tasks");
    expect(headers["Create-Target-If-Missing"]).toBe("true");
  });

  test("sends PATCH to date-specific path", async () => {
    harness.setFetchResponse(
      mockResponse("patched", { contentType: "text/markdown" }),
    );
    await harness.dispatch("patch_periodic_note", {
      period: "quarterly",
      year: 2026,
      month: 1,
      day: 1,
      operation: "replace",
      targetType: "frontmatter",
      target: "status",
      content: '"done"',
      contentType: "application/json",
    });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(`${BASE_URL}/periodic/quarterly/2026/1/1/`);
    const headers = lastFetch.init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });
});

describe("delete_periodic_note", () => {
  test("sends DELETE to /periodic/{period}/", async () => {
    harness.setFetchResponse(mock204());
    const result = await harness.dispatch("delete_periodic_note", {
      period: "daily",
    });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(`${BASE_URL}/periodic/daily/`);
    expect(lastFetch.init?.method).toBe("DELETE");
    expect(result.content[0].text).toContain("deleted");
  });

  test("sends DELETE to date-specific path", async () => {
    harness.setFetchResponse(mock204());
    await harness.dispatch("delete_periodic_note", {
      period: "weekly",
      year: 2026,
      month: 3,
      day: 10,
    });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(`${BASE_URL}/periodic/weekly/2026/3/10/`);
  });
});

describe("list_commands", () => {
  test("sends GET to /commands/", async () => {
    harness.setFetchResponse(mockResponse(commandsResponse));
    const result = await harness.dispatch("list_commands");

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(`${BASE_URL}/commands/`);
    expect(lastFetch.init?.method).toBeUndefined(); // defaults to GET
    expect(result.content[0].text).toContain("editor:toggle-bold");
  });
});

describe("execute_command", () => {
  test("sends POST to /commands/{commandId}/", async () => {
    harness.setFetchResponse(mock204());
    const result = await harness.dispatch("execute_command", {
      commandId: "editor:toggle-bold",
    });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(
      `${BASE_URL}/commands/${encodeURIComponent("editor:toggle-bold")}/`,
    );
    expect(lastFetch.init?.method).toBe("POST");
    expect(result.content[0].text).toContain("executed successfully");
  });

  test("URL-encodes command IDs with special characters", async () => {
    harness.setFetchResponse(mock204());
    await harness.dispatch("execute_command", {
      commandId: "plugin:my-plugin:do-thing",
    });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(
      `${BASE_URL}/commands/${encodeURIComponent("plugin:my-plugin:do-thing")}/`,
    );
  });
});

describe("error handling", () => {
  test("throws McpError on HTTP 404", async () => {
    harness.setFetchResponse(mockErrorResponse(404, "File not found"));

    try {
      await harness.dispatch("get_vault_file", { filename: "missing.md" });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(McpError);
      expect((error as McpError).message).toContain("404");
    }
  });

  test("throws McpError on HTTP 500", async () => {
    harness.setFetchResponse(mockErrorResponse(500, "Internal Server Error"));

    try {
      await harness.dispatch("get_server_info");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(McpError);
      expect((error as McpError).message).toContain("500");
    }
  });

  test("throws McpError for unknown tool name", async () => {
    try {
      await harness.dispatch("nonexistent_tool");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(McpError);
      expect((error as McpError).code).toBe(ErrorCode.InvalidRequest);
      expect((error as McpError).message).toContain("Unknown tool");
    }
  });
});
