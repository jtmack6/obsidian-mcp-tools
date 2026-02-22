.PHONY: all install build build-server build-plugin check test clean \
       dev dev-server dev-plugin release release-server release-plugin \
       install-plugin link setup inspector version help

# Paths
ROOT        := $(shell pwd)
SERVER_DIR  := packages/mcp-server
PLUGIN_DIR  := packages/obsidian-plugin
SERVER_BIN  := bin/mcp-server
DIST_DIR    := $(SERVER_DIR)/dist

# Defaults
VAULT_CONFIG ?= $(HOME)/Documents/Obsidian_Vault/.obsidian
PLUGIN_ID   := mcp-tools
PLUGIN_DEST := $(VAULT_CONFIG)/plugins/$(PLUGIN_ID)

## help: Show this help message
help:
	@printf '\nUsage: make <target> [VAR=value]\n\n'
	@printf 'Targets:\n'
	@sed -n 's/^## /  /p' $(MAKEFILE_LIST) | column -t -s ':'
	@printf '\nVariables:\n'
	@printf '  OBSIDIAN_API_KEY  API key from Local REST API plugin (for setup)\n'
	@printf '  VAULT_CONFIG      Path to .obsidian config dir (for link, default: %s)\n' '$(VAULT_CONFIG)'
	@printf '\n'

# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------

## all: Install deps, type-check, build server + plugin
all: install check build

## install: Install all workspace dependencies
install:
	bun install

## check: Type-check all packages
check:
	bun run check

## test: Run MCP server unit tests
test:
	cd $(SERVER_DIR) && bun run test

## build: Build server binary and plugin
build: build-server build-plugin

## build-server: Compile MCP server to bin/mcp-server
build-server:
	cd $(SERVER_DIR) && bun run build

## build-plugin: Build the Obsidian plugin
build-plugin:
	cd $(PLUGIN_DIR) && bun run build

## clean: Remove build artifacts
clean:
	rm -rf $(SERVER_BIN) $(DIST_DIR) \
	       $(PLUGIN_DIR)/main.js $(PLUGIN_DIR)/main.js.map \
	       $(PLUGIN_DIR)/releases

# ---------------------------------------------------------------------------
# Development
# ---------------------------------------------------------------------------

## dev: Run all packages in watch mode
dev:
	bun run dev

## dev-server: Run MCP server in watch mode
dev-server:
	cd $(SERVER_DIR) && bun run dev

## dev-plugin: Run Obsidian plugin in watch mode
dev-plugin:
	cd $(PLUGIN_DIR) && bun run dev

## inspector: Launch MCP Inspector web UI for debugging
inspector:
	cd $(SERVER_DIR) && bun run inspector

# ---------------------------------------------------------------------------
# Release
# ---------------------------------------------------------------------------

## release: Cross-platform server builds + plugin zip
release: release-server release-plugin

## release-server: Build server for linux, mac-arm64, mac-x64, windows
release-server:
	cd $(SERVER_DIR) && bun run release

## release-plugin: Build and zip the Obsidian plugin
release-plugin:
	cd $(PLUGIN_DIR) && bun run release

## version: Bump version (make version BUMP=patch|minor|major)
version:
	@if [ -z "$(BUMP)" ]; then \
		echo "Usage: make version BUMP=patch|minor|major"; exit 1; \
	fi
	bun run version $(BUMP)

# ---------------------------------------------------------------------------
# Install / Link
# ---------------------------------------------------------------------------

## setup: Register MCP server in Claude Desktop config (requires OBSIDIAN_API_KEY)
setup:
	@if [ -z "$(OBSIDIAN_API_KEY)" ]; then \
		echo "Usage: make setup OBSIDIAN_API_KEY=<key>"; exit 1; \
	fi
	cd $(SERVER_DIR) && bun run setup $(OBSIDIAN_API_KEY)

## install-plugin: Build and install plugin + server to Obsidian vault (uses VAULT_CONFIG)
install-plugin: build
	@mkdir -p $(PLUGIN_DEST)/bin
	cp main.js manifest.json $(PLUGIN_DEST)/
	cp $(DIST_DIR)/mcp-server $(PLUGIN_DEST)/bin/
	@test -f styles.css && cp styles.css $(PLUGIN_DEST)/ || true
	@echo "Plugin installed to $(PLUGIN_DEST)"

## link: Symlink plugin into Obsidian vault for development (uses VAULT_CONFIG)
link:
	cd $(PLUGIN_DIR) && bun scripts/link.ts $(VAULT_CONFIG)
