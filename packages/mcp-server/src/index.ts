#!/usr/bin/env -S deno run --allow-env --allow-read --allow-write --allow-net
import { logger } from "$/shared/index.ts";
import { ObsidianMcpServer } from "./features/core/index.ts";
import { getVersion } from "./features/version/index.ts";

async function main() {
  try {
    // Verify required environment variables
    const API_KEY = process.env.OBSIDIAN_API_KEY;
    if (!API_KEY) {
      throw new Error("OBSIDIAN_API_KEY environment variable is required");
    }

    logger.debug("Starting MCP Tools for Obsidian server...");
    const server = new ObsidianMcpServer();
    await server.run();
    logger.debug("MCP Tools for Obsidian server is running");
  } catch (error) {
    logger.fatal("Failed to start server", {
      error: error instanceof Error ? error.message : String(error),
    });
    await logger.flush();
    throw error;
  }
}

if (process.argv.includes("--version")) {
  try {
    console.log(getVersion());
  } catch (error) {
    console.error(`Error getting version: ${error}`);
    process.exit(1);
  }
} else {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
