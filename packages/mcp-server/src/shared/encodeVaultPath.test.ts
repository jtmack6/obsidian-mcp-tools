import { describe, expect, test } from "bun:test";
import { encodeVaultPath } from "./encodeVaultPath";

describe("encodeVaultPath", () => {
  test("leaves path separators literal", () => {
    expect(encodeVaultPath("Projects/mixctl/PLAN.md")).toBe(
      "Projects/mixctl/PLAN.md",
    );
  });

  test("escapes spaces within segments", () => {
    expect(encodeVaultPath("my folder/my note.md")).toBe(
      "my%20folder/my%20note.md",
    );
  });

  test("escapes characters that would change URL parsing", () => {
    expect(encodeVaultPath("notes/a#b?c.md")).toBe("notes/a%23b%3Fc.md");
  });

  test("preserves a trailing slash", () => {
    expect(encodeVaultPath("Prompts/")).toBe("Prompts/");
  });

  test("handles a bare filename", () => {
    expect(encodeVaultPath("note.md")).toBe("note.md");
  });
});
