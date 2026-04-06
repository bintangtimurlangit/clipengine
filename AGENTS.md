# Agent / contributor notes

- **Package layout:** `src/clipengine/` is the core library, organized into three stage subpackages:
  - `clipengine.ingest` — audio extraction (`audio.py`) and Whisper transcription (`transcribe.py`)
  - `clipengine.plan` — LLM cut planning (`llm.py`), Tavily search (`search.py`), segment snapping (`snap.py`)
  - `clipengine.render` — FFmpeg encode (`ffmpeg.py`)
  - `clipengine.pipeline` — orchestrates `run_ingest`, `run_plan`, `run_render` (entry point for the API)
- **Apps:** `apps/web` (Next.js), `apps/api` (FastAPI). Docker: **`docker-compose.yml`** = production (`docker compose up`); **`docker-compose.dev.yml`** = development / hot reload. See **`docs/docker.md`**.
- **API layout:** `apps/api/clipengine_api/` uses `core/` (db + env), `routers/` (HTTP), `services/` (pipeline runner + workspace), `storage/` (runs DB).
- **Docs:** README, **`docs/pipeline.md`**, **`docs/bind-mounts.md`** (host folders + Settings allowlist), **`docs/architecture.md`**, **`docs/docker.md`**, **`docs/configuration.md`**. When changing pipeline behavior or env vars, update **`docs/pipeline.md`** and **`docs/configuration.md`**.
