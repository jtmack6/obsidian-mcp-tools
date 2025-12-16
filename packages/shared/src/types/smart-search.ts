import { type } from "arktype";
import * as SmartConnections from "./plugin-smart-connections.ts";

const searchRequest = type({
  query: type("string>0").describe("A search phrase for semantic search"),
  "filter?": {
    "folders?": type("string[]").describe(
      'An array of folder names to include. For example, ["Public", "Work"]',
    ),
    "excludeFolders?": type("string[]").describe(
      'An array of folder names to exclude. For example, ["Private", "Archive"]',
    ),
    "limit?": type("number>0").describe(
      "The maximum number of results to return",
    ),
  },
});
export const jsonSearchRequest = type("string.json.parse").to(searchRequest);

const searchResponse = type({
  results: type({
    path: "string",
    text: "string",
    score: "number",
    breadcrumbs: "string",
  }).array(),
});
export type SearchResponse = typeof searchResponse.infer;

export const searchParameters = type({
  query: "string",
  filter: SmartConnections.SmartSearchFilter,
});