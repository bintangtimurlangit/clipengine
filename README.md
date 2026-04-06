# Clip Engine

**Turn long videos into publish-ready clips**—the engine **listens**, **understands context**, and **cuts where speech and story make sense**, producing **landscape longform** (16:9) and **vertical shortform** (9:16) from one source.

**Primary interface:** **Web UI** + **HTTP API** (Docker Compose). The core logic lives in the Python package **`clipengine`** (Whisper + LLM + FFmpeg); there is **no terminal CLI** in this repository.

**Repository:** [github.com/bintangtimurlangit/clipengine](https://github.com/bintangtimurlangit/clipengine)

---

## Quick start (Docker)

**Prerequisites:** Docker Compose v2, FFmpeg is bundled in the API image; optional GPU for Whisper.

**Production** (default — baked images, for regular use):

```bash
docker compose up --build
```

**Development** (hot reload while editing the repo) — [`docker-compose.dev.yml`](docker-compose.dev.yml):

```bash
docker compose -f docker-compose.dev.yml up --build
```

Open **http://localhost:3000**. Complete **Setup** (admin account in SQLite), then use **Import** → **Runs** → **Start pipeline**. Configure **LLM provider and API keys** under **Settings** (stored in SQLite). Optional process env vars (e.g. for Compose or CI) are listed in **[docs/configuration.md](docs/configuration.md)**.

---

## What it does

1. **Ingest** — FFmpeg + **faster-whisper** → `transcript.json`, `segments.vtt`  
2. **Plan** — **LLM** (OpenAI-compatible or Anthropic) → `cut_plan.json`; optional **Tavily** web context if `TAVILY_API_KEY` is set  
3. **Render** — FFmpeg → `rendered/longform/*.mp4`, `rendered/shortform/*.mp4` (with optional transcript snapping)

See **[docs/pipeline.md](docs/pipeline.md)** for stages and artifacts.

---

## Compatibility: OpenAI & Anthropic

| Backend | Configure |
|---------|-----------|
| **OpenAI-compatible** | **Settings** (or set `OPENAI_API_KEY`, optional `OPENAI_BASE_URL`, `OPENAI_MODEL` in the environment) |
| **Anthropic** | **Settings** (or set `ANTHROPIC_API_KEY`, optional `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` in the environment) |

> Clipping is **not deterministic** across models. Preview outputs before publishing.

---

## Development (without Docker)

For working on **`clipengine`**, **apps/api**, or **apps/web**:

```bash
pip install -e ".[dev]"
pip install -e "apps/api[dev]"
```

Run the API with **uvicorn** and the web app with **`npm run dev`** in `apps/web` (see **[apps/api/README.md](apps/api/README.md)**). You still need FFmpeg on the host if you run ingest/render outside Docker.

---

## Docs

| Doc | Contents |
|-----|----------|
| **[docs/pipeline.md](docs/pipeline.md)** | Ingest / plan / render stages and artifacts |
| **[docs/architecture.md](docs/architecture.md)** | Modules, Web UI, API, Docker |
| **[docs/docker.md](docs/docker.md)** | Compose, volumes, GPU |
| **[docs/bind-mounts.md](docs/bind-mounts.md)** | Mount host folders + Settings allowlist |
| **[docs/configuration.md](docs/configuration.md)** | Settings vs environment variables |
| **[docs/repo-layout.md](docs/repo-layout.md)** | Folders: `apps/`, `src/clipengine/`, Docker |
| **[CONTRIBUTING.md](CONTRIBUTING.md)** | Dev setup, Ruff, pytest |
| **[CHANGELOG.md](CHANGELOG.md)** | Release history |

## License

MIT — see [LICENSE](LICENSE).
