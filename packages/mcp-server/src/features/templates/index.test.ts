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
import { registerTemplaterTools } from "./index";

let harness: ReturnType<typeof createTestHarness>;

beforeAll(() => {
  process.env.OBSIDIAN_API_KEY = "test-api-key";
  harness = createTestHarness();
  registerTemplaterTools(harness.tools);
});

afterEach(() => {
  harness.clearFetchCalls();
});

afterAll(() => {
  harness.cleanup();
});

const templateFileResponse = {
  frontmatter: { tags: [], description: "A template" },
  content: "Hello, this is a simple template with no parameters.",
  path: "templates/simple.md",
  stat: { ctime: 1000, mtime: 2000, size: 50 },
  tags: [],
};

const templateExecResponse = {
  message: "Template executed successfully",
  content: "Rendered template content",
};

describe("execute_template", () => {
  test("fetches template then posts execution", async () => {
    harness.setFetchResponseQueue([
      mockResponse(templateFileResponse),
      mockResponse(templateExecResponse),
    ]);

    const result = await harness.dispatch("execute_template", {
      name: "templates/simple.md",
      arguments: {},
    });

    const calls = harness.getFetchCalls();
    expect(calls).toHaveLength(2);

    // First call: GET the template file
    expect(calls[0].url).toBe(`${BASE_URL}/vault/templates/simple.md`);
    const firstHeaders = calls[0].init?.headers as Record<string, string>;
    expect(firstHeaders.Accept).toBe("application/vnd.olrapi.note+json");

    // Second call: POST to execute
    expect(calls[1].url).toBe(`${BASE_URL}/templates/execute`);
    expect(calls[1].init?.method).toBe("POST");
    const secondHeaders = calls[1].init?.headers as Record<string, string>;
    expect(secondHeaders["Content-Type"]).toBe("application/json");

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.message).toBe("Template executed successfully");
  });

  test("passes arguments in execution body", async () => {
    harness.setFetchResponseQueue([
      mockResponse(templateFileResponse),
      mockResponse(templateExecResponse),
    ]);

    await harness.dispatch("execute_template", {
      name: "templates/simple.md",
      arguments: { title: "My Title", author: "Test" },
    });

    const execBody = JSON.parse(
      harness.getFetchCalls()[1].init?.body as string,
    );
    expect(execBody.arguments.title).toBe("My Title");
    expect(execBody.arguments.author).toBe("Test");
  });

  test("coerces createFile string to boolean", async () => {
    harness.setFetchResponseQueue([
      mockResponse(templateFileResponse),
      mockResponse(templateExecResponse),
    ]);

    await harness.dispatch("execute_template", {
      name: "templates/simple.md",
      arguments: {},
      createFile: "true",
    });

    const execBody = JSON.parse(
      harness.getFetchCalls()[1].init?.body as string,
    );
    expect(execBody.createFile).toBe(true);
  });
});
