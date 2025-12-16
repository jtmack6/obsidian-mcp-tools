import { logger } from "$/shared/logger";
import fsp from "fs/promises";
import { Plugin } from "obsidian";
import path from "path";
import { BINARY_NAME } from "../constants";
import { getPlatform } from "./install";
import { getFileSystemAdapter } from "../utils/getFileSystemAdapter";
import { removeFromClaudeConfig } from "./config";

/**
 * Uninstalls the MCP server by removing the binary and cleaning up configuration
 */
export async function uninstallServer(plugin: Plugin): Promise<void> {
  try {
    const adapter = getFileSystemAdapter(plugin);
    if ("error" in adapter) {
      throw new Error(adapter.error);
    }

    // Remove binary
    const platform = getPlatform();
    const binDir = path.join(
      adapter.getBasePath(),
      plugin.app.vault.configDir,
      "plugins",
      plugin.manifest.id,
      "bin",
    );
    const binaryPath = path.join(binDir, BINARY_NAME[platform]);

    try {
      await fsp.unlink(binaryPath);
      logger.info("Removed server binary", { binaryPath });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      // File doesn't exist, continue
    }

    // Remove bin directory if empty
    try {
      await fsp.rmdir(binDir);
      logger.info("Removed empty bin directory", { binDir });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOTEMPTY") {
        throw error;
      }
      // Directory not empty, leave it
    }

    // Remove our entry from Claude config using the platform-aware function
    try {
      await removeFromClaudeConfig();
    } catch (error) {
      // Log but don't fail if config removal fails
      logger.warn("Failed to remove from Claude config:", { error });
    }

    logger.info("Server uninstall complete");
  } catch (error) {
    logger.error("Failed to uninstall server:", { error });
    throw new Error(
      `Failed to uninstall server: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
