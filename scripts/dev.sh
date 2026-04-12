#!/usr/bin/env bash
# Run API + web locally (no Docker). Requires FFmpeg on PATH, editable installs, and npm deps.
# Usage: from repo root, after installing Python deps (venv recommended) and npm ci:
#   uv pip install -e ".[dev]" -p .venv/bin/python && uv pip install -e "apps/api[dev]" -p .venv/bin/python
#   (cd apps/web && npm ci)
#   ./scripts/dev.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export CLIPENGINE_DATA_DIR="${CLIPENGINE_DATA_DIR:-$ROOT/.clipengine-data}"
export CLIPENGINE_WORKSPACE="${CLIPENGINE_WORKSPACE:-$ROOT/.clipengine-workspace}"
export API_INTERNAL_URL="${API_INTERNAL_URL:-http://127.0.0.1:8000}"

mkdir -p "$CLIPENGINE_DATA_DIR" "$CLIPENGINE_WORKSPACE"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found on PATH. Install it (e.g. brew install ffmpeg on macOS)." >&2
  exit 1
fi

if [[ -x "$ROOT/.venv/bin/uvicorn" ]]; then
  UVICORN="$ROOT/.venv/bin/uvicorn"
elif command -v uvicorn >/dev/null 2>&1; then
  UVICORN=uvicorn
else
  echo "uvicorn not found. Use repo .venv: uv pip install -e \".[dev]\" -p .venv/bin/python && uv pip install -e \"apps/api[dev]\" -p .venv/bin/python" >&2
  exit 1
fi

if [[ ! -d "$ROOT/apps/web/node_modules" ]]; then
  echo "apps/web/node_modules missing. Run: (cd apps/web && npm ci)" >&2
  exit 1
fi

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then kill "$API_PID" 2>/dev/null || true; fi
  if [[ -n "${WEB_PID:-}" ]]; then kill "$WEB_PID" 2>/dev/null || true; fi
}
trap cleanup INT TERM EXIT

echo "Data:    $CLIPENGINE_DATA_DIR"
echo "Work:    $CLIPENGINE_WORKSPACE"
echo "API:     http://127.0.0.1:8000  (reload: src/, apps/api/)"
echo "Web:     http://localhost:3000  (proxy → $API_INTERNAL_URL)"
echo ""

(
  cd "$ROOT/apps/api"
  exec "$UVICORN" clipengine_api.main:app \
    --host 127.0.0.1 \
    --port 8000 \
    --reload \
    --reload-dir "$ROOT/src" \
    --reload-dir "$ROOT/apps/api"
) &
API_PID=$!

(
  cd "$ROOT/apps/web"
  exec npm run dev
) &
WEB_PID=$!

wait
