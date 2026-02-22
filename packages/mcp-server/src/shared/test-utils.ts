import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ToolRegistryClass } from "./ToolRegistry";

/** Shape of the result returned by tool handlers */
export interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Creates a mock Response object with the given body and options.
 */
export function mockResponse(
  body: unknown,
  options: {
    status?: number;
    contentType?: string;
    headers?: Record<string, string>;
  } = {},
): Response {
  const {
    status = 200,
    contentType = "application/json",
    headers = {},
  } = options;
  const isJson = contentType.includes("json");
  const bodyStr = isJson ? JSON.stringify(body) : String(body);

  return new Response(bodyStr, {
    status,
    headers: { "Content-Type": contentType, ...headers },
  });
}

/**
 * Creates a 204 No Content response.
 */
export function mock204(): Response {
  return new Response(null, { status: 204 });
}

/**
 * Creates an error response with the given status and message.
 */
export function mockErrorResponse(status: number, message: string): Response {
  return new Response(message, { status, headers: {} });
}

interface FetchCall {
  url: string;
  init?: RequestInit;
}

/**
 * Creates a test harness for MCP tool tests.
 * Mocks globalThis.fetch, sets up a ToolRegistry, and provides helpers.
 */
export function createTestHarness() {
  const originalFetch = globalThis.fetch;
  const fetchCalls: FetchCall[] = [];
  let responseQueue: Response[] = [];

  const tools = new ToolRegistryClass();

  const mockServer = {} as Server;

  const mockFetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    fetchCalls.push({ url, init });

    const response = responseQueue.shift();
    if (!response) {
      throw new Error(`No mock response set for fetch call to ${url}`);
    }
    return response;
  };
  mockFetch.preconnect = (_url: string) => {};
  globalThis.fetch = mockFetch as typeof globalThis.fetch;

  return {
    tools,
    mockServer,

    /**
     * Set a single response for the next fetch call.
     */
    setFetchResponse(response: Response) {
      responseQueue = [response];
    },

    /**
     * Set a queue of responses for sequential fetch calls.
     */
    setFetchResponseQueue(responses: Response[]) {
      responseQueue = [...responses];
    },

    /**
     * Dispatch a tool call through the registry.
     */
    async dispatch(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
      return await tools.dispatch(
        { name, arguments: args },
        { server: mockServer },
      ) as unknown as ToolResult;
    },

    /**
     * Get the most recent fetch call.
     */
    getLastFetch(): FetchCall | undefined {
      return fetchCalls[fetchCalls.length - 1];
    },

    /**
     * Get all fetch calls made.
     */
    getFetchCalls(): FetchCall[] {
      return fetchCalls;
    },

    /**
     * Clear recorded fetch calls.
     */
    clearFetchCalls() {
      fetchCalls.length = 0;
    },

    /**
     * Restore the original globalThis.fetch.
     */
    cleanup() {
      globalThis.fetch = originalFetch;
    },
  };
}
