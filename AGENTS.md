# Agent / contributor notes

- **Commits & PRs:** Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/#specification): `<type>(optional-scope): imperative description` (e.g. `feat(web):`, `fix(api):`, `chore:`). PR titles targeting `dev` or `main` are linted in CI (`.github/workflows/lint-pr-title.yml`); match that format for local commits so history stays consistent.
- **Package layout:** `src/clipengine/` is the core library, organized into three stage subpackages:
  - `clipengine.ingest` — audio extraction (`audio.py`) and Whisper transcription (`transcribe.py`)
  - `clipengine.plan` — LLM cut planning (`llm.py`), web search (`search.py` + `search_providers/` per vendor), segment snapping (`snap.py`)
  - `clipengine.render` — FFmpeg encode (`ffmpeg.py`)
  - `clipengine.pipeline` — orchestrates `run_ingest`, `run_plan`, `run_render` (entry point for the API)
- **Apps:** `apps/web` (Next.js), `apps/api` (FastAPI). Docker: **`docker-compose.yml`** = production (`docker compose up`); **`docker-compose.dev.yml`** = development / hot reload. See **`docs/docker.md`**.
- **API layout:** `apps/api/clipengine_api/` uses `core/` (db + env), `routers/` (HTTP), `services/` (pipeline runner, `pipeline_execute`, optional `docker_worker`), `worker.py` (CLI for ephemeral containers), `storage/` (runs DB).
- **Docs:** README, **`docs/pipeline.md`**, **`docs/bind-mounts.md`** (host folders + Settings allowlist), **`docs/architecture.md`**, **`docs/docker.md`**, **`docs/configuration.md`**, **`docs/repo-layout.md`**. When changing pipeline behavior or env vars, update **`docs/pipeline.md`** and **`docs/configuration.md`** (and **`docs/docker.md`** when Docker worker behavior or compose changes).
