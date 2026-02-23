#!/usr/bin/env bun
import { getVersion } from "./features/version" with { type: "macro" };

// Handle --version before loading heavy modules that may block on stdin
if (process.argv.includes("--version")) {
  console.log(getVersion());
  process.exit(0);
}

// Dynamic imports to avoid side effects when only printing version
const { logger } = await import("$/shared");
const { ObsidianMcpServer } = await import("./features/core");

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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
