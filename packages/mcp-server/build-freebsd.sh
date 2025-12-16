#!/bin/sh
# Build script for MCP server on FreeBSD using Deno

set -e

echo "Building MCP server for FreeBSD..."

# Ensure we're in the right directory
cd "$(dirname "$0")"

# Create dist directory if it doesn't exist
mkdir -p dist

# Compile the binary
deno compile \
  --no-check \
  --allow-env \
  --allow-read \
  --allow-write \
  --allow-net \
  --allow-sys \
  --output dist/mcp-server-freebsd \
  src/index.ts

echo "Build complete!"
echo "Binary created at: dist/mcp-server-freebsd"
echo "Size: $(du -h dist/mcp-server-freebsd | cut -f1)"
echo ""
echo "Test it with: ./dist/mcp-server-freebsd --version"
