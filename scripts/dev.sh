#!/usr/bin/env bash
# Local dev: spin up apps/api and apps/web with hot reload.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v pnpm >/dev/null 2>&1; then
  echo "error: pnpm not found. install with 'npm i -g pnpm@9.12.3'." >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "info: running pnpm install (first run)…"
  pnpm install
fi

exec pnpm turbo run dev --parallel
