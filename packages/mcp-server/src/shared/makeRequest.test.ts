import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { type } from "arktype";
import { mock204, mockErrorResponse, mockResponse } from "./test-utils";

// Save and restore env + fetch
const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OBSIDIAN_API_KEY;

/** Helper to set a mock fetch that satisfies Bun's extended type */
function setMockFetch(fn: (input: string | URL | Request, init?: RequestInit) => Promise<Response>) {
  const mock = fn as typeof globalThis.fetch;
  mock.preconnect = () => {};
  globalThis.fetch = mock;
}

beforeAll(() => {
  process.env.OBSIDIAN_API_KEY = "test-api-key";
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey !== undefined) {
    process.env.OBSIDIAN_API_KEY = originalApiKey;
  } else {
    delete process.env.OBSIDIAN_API_KEY;
  }
});

// Must import after setting env so BASE_URL is computed
const { makeRequest, BASE_URL } = await import("./makeRequest");

describe("makeRequest", () => {
  test("sends Authorization header with Bearer token", async () => {
    let capturedInit: RequestInit | undefined;
    setMockFetch(async (_url, init?) => {
      capturedInit = init;
      return mockResponse({ value: "ok" });
    });

    await makeRequest(type({ value: "string" }), "/test");

    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-api-key");
  });

  test("sends default Content-Type header", async () => {
    let capturedInit: RequestInit | undefined;
    setMockFetch(async (_url, init?) => {
      capturedInit = init;
      return mockResponse({ value: "ok" });
    });

    await makeRequest(type({ value: "string" }), "/test");

    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("text/markdown");
  });

  test("constructs URL from BASE_URL + path", async () => {
    let capturedUrl: string = "";
    setMockFetch(async (input) => {
      capturedUrl = typeof input === "string" ? input : input.toString();
      return mockResponse({ value: "ok" });
    });

    await makeRequest(type({ value: "string" }), "/my/path");

    expect(capturedUrl).toBe(`${BASE_URL}/my/path`);
  });

  test("parses JSON response when Content-Type includes json", async () => {
    setMockFetch(async () => mockResponse({ name: "test" }));

    const result = await makeRequest(type({ name: "string" }), "/test");
    expect(result).toEqual({ name: "test" });
  });

  test("returns text for non-JSON Content-Type", async () => {
    setMockFetch(async () =>
      mockResponse("plain text", { contentType: "text/markdown" }),
    );

    const result = await makeRequest(type("string"), "/test");
    expect(result).toBe("plain text");
  });

  test("throws McpError on non-ok HTTP status", async () => {
    setMockFetch(async () => mockErrorResponse(404, "Not Found"));

    try {
      await makeRequest(type("string"), "/missing", { method: "GET" });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(McpError);
      const mcpError = error as McpError;
      expect(mcpError.code).toBe(ErrorCode.InternalError);
      expect(mcpError.message).toContain("404");
      expect(mcpError.message).toContain("Not Found");
    }
  });

  test("throws McpError on ArkType validation failure", async () => {
    setMockFetch(async () => mockResponse({ wrong: "shape" }));

    try {
      await makeRequest(type({ name: "string" }), "/test");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(McpError);
      const mcpError = error as McpError;
      expect(mcpError.code).toBe(ErrorCode.InternalError);
      expect(mcpError.message).toContain("200");
    }
  });

  test("returns undefined for 204 No Content", async () => {
    setMockFetch(async () => mock204());

    const result = await makeRequest(type("unknown"), "/test");
    expect(result).toBeUndefined();
  });

  test("throws Error when OBSIDIAN_API_KEY is missing", async () => {
    const saved = process.env.OBSIDIAN_API_KEY;
    delete process.env.OBSIDIAN_API_KEY;

    try {
      await makeRequest(type("string"), "/test");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("OBSIDIAN_API_KEY");
    } finally {
      process.env.OBSIDIAN_API_KEY = saved;
    }
  });
});
