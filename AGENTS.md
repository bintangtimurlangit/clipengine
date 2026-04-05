# Notes for AI coding agents

- **Package layout:** `src/clip_engine/` is the only application package; entrypoint is `clip-engine` → `clip_engine.cli:app`.
- **Config:** `.env` (see `.env.example`). Never commit secrets.
- **External tools:** `ffmpeg` / `ffprobe` on PATH; optional **Node** for Tavily MCP (`npx -y tavily-mcp`) when `TAVILY_API_KEY` is set.
- **Style:** Ruff, line length 100, Python 3.10+. Prefer focused diffs; avoid unrelated refactors.
- **Docs:** README and `docs/architecture.md` are the source of truth for behavior; update them when changing user-visible CLI or pipeline.
