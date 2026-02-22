import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { createTestHarness, mockResponse } from "$/shared/test-utils";
import { registerFetchTool } from "./index";
import { DEFAULT_USER_AGENT } from "./constants";

let harness: ReturnType<typeof createTestHarness>;

beforeAll(() => {
  process.env.OBSIDIAN_API_KEY = "test-api-key";
  harness = createTestHarness();
  registerFetchTool(harness.tools, harness.mockServer);
});

afterEach(() => {
  harness.clearFetchCalls();
});

afterAll(() => {
  harness.cleanup();
});

describe("fetch tool", () => {
  test("fetches URL with User-Agent header", async () => {
    harness.setFetchResponse(
      mockResponse("<html><body><p>Hello</p></body></html>", {
        contentType: "text/html",
      }),
    );
    await harness.dispatch("fetch", { url: "https://example.com" });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe("https://example.com");
    const headers = lastFetch.init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe(DEFAULT_USER_AGENT);
  });

  test("converts HTML to markdown by default", async () => {
    harness.setFetchResponse(
      mockResponse("<html><body><h1>Title</h1><p>Paragraph</p></body></html>", {
        contentType: "text/html",
      }),
    );
    const result = await harness.dispatch("fetch", {
      url: "https://example.com",
    });

    // Should contain converted markdown, not raw HTML tags
    const text = result.content[0].text;
    expect(text).toContain("Title");
    expect(text).not.toContain("<h1>");
  });

  test("returns raw HTML when raw=true", async () => {
    harness.setFetchResponse(
      mockResponse("<html><body><h1>Title</h1></body></html>", {
        contentType: "text/html",
      }),
    );
    const result = await harness.dispatch("fetch", {
      url: "https://example.com",
      raw: true,
    });

    const text = result.content[0].text;
    expect(text).toContain("<h1>");
    expect(text).toContain("cannot be simplified to markdown");
  });

  test("truncates content beyond maxLength and includes pagination", async () => {
    const longContent = "A".repeat(200);
    harness.setFetchResponse(
      mockResponse(longContent, { contentType: "text/plain" }),
    );
    const result = await harness.dispatch("fetch", {
      url: "https://example.com/long",
      maxLength: 50,
      raw: true,
    });

    const mainText = result.content[0].text;
    expect(mainText).toContain("Content truncated");

    // Pagination info
    const paginationText = result.content[1].text;
    expect(paginationText).toContain("totalLength");
    expect(paginationText).toContain('"hasMore":true');
  });

  test("throws McpError on HTTP error", async () => {
    harness.setFetchResponse(
      new Response("Server Error", { status: 500 }),
    );

    try {
      await harness.dispatch("fetch", { url: "https://example.com/error" });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(McpError);
      expect((error as McpError).message).toContain("Failed to fetch");
      expect((error as McpError).message).toContain("500");
    }
  });
});
