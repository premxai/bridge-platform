#!/usr/bin/env bash
# Run the Terse CLI on Windows through Docker (Terse needs Bun, which runs in Linux).
# The login is kept in the "terse-home" Docker volume; the actors project is platform/actors.
# Examples (run from the platform folder in Git Bash):
#   bash scripts/terse.sh auth login --no-browser
#   bash scripts/terse.sh init bridge-actors --template counter
#   bash scripts/terse.sh actor dev
#   bash scripts/terse.sh deploy
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd -W 2>/dev/null || pwd)"
mkdir -p "$here/actors"
exec docker run -it --rm \
  -v terse-home:/root \
  -v "$here/actors:/app" \
  -w /app \
  -p 7100:7100 \
  oven/bun:1 bunx terse-cli@latest "$@"
