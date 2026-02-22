import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { createTestHarness, mockResponse } from "$/shared/test-utils";
import { BASE_URL } from "$/shared/makeRequest";
import { registerSmartConnectionsTools } from "./index";

let harness: ReturnType<typeof createTestHarness>;

beforeAll(() => {
  process.env.OBSIDIAN_API_KEY = "test-api-key";
  harness = createTestHarness();
  registerSmartConnectionsTools(harness.tools);
});

afterEach(() => {
  harness.clearFetchCalls();
});

afterAll(() => {
  harness.cleanup();
});

const smartSearchResponse = {
  results: [
    {
      path: "notes/ai.md",
      text: "AI and machine learning concepts",
      score: 0.95,
      breadcrumbs: "notes > ai",
    },
    {
      path: "notes/ml.md",
      text: "Deep learning fundamentals",
      score: 0.87,
      breadcrumbs: "notes > ml",
    },
  ],
};

describe("search_vault_smart", () => {
  test("sends POST to /search/smart with JSON body", async () => {
    harness.setFetchResponse(mockResponse(smartSearchResponse));
    const result = await harness.dispatch("search_vault_smart", {
      query: "machine learning",
    });

    const lastFetch = harness.getLastFetch()!;
    expect(lastFetch.url).toBe(`${BASE_URL}/search/smart`);
    expect(lastFetch.init?.method).toBe("POST");

    const body = JSON.parse(lastFetch.init?.body as string);
    expect(body.query).toBe("machine learning");

    expect(result.content[0].text).toContain("ai.md");
  });

  test("passes filter options in body", async () => {
    harness.setFetchResponse(mockResponse(smartSearchResponse));
    await harness.dispatch("search_vault_smart", {
      query: "test query",
      filter: {
        folders: ["Public"],
        excludeFolders: ["Private"],
        limit: 5,
      },
    });

    const body = JSON.parse(harness.getLastFetch()!.init?.body as string);
    expect(body.filter.folders).toEqual(["Public"]);
    expect(body.filter.excludeFolders).toEqual(["Private"]);
    expect(body.filter.limit).toBe(5);
  });

  test("returns formatted JSON results", async () => {
    harness.setFetchResponse(mockResponse(smartSearchResponse));
    const result = await harness.dispatch("search_vault_smart", {
      query: "anything",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0].path).toBe("notes/ai.md");
  });
});
