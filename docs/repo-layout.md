# Repository layout

```
clip-engine/
├── apps/
│   ├── api/                    # FastAPI (clipengine-api package)
│   │   └── clipengine_api/
│   │       ├── main.py         # App factory, setup routes, router mount
│   │       ├── db.py           # SQLite: admin + persisted LLM JSON
│   │       ├── runs_db.py      # Pipeline run rows
│   │       ├── routers/        # HTTP route handlers (runs, settings)
│   │       └── services/       # pipeline_runner, workspace, engine env overlay
│   └── web/                    # Next.js App Router UI
├── docker/
│   ├── api.Dockerfile
│   └── web.Dockerfile
├── docs/                       # Architecture, Docker, pipeline, bind-mounts tutorial
├── src/
│   └── clipengine/            # Core Python library (Whisper, LLM, FFmpeg)
│       ├── pipeline/           # run_ingest, run_plan, run_render
│       ├── llm.py, render.py, transcribe.py, …
│       └── …
├── tests/
├── docker-compose.yml          # production (`docker compose up`)
├── docker-compose.dev.yml      # development: hot reload (`-f docker-compose.dev.yml`)
├── pyproject.toml              # clip-engine library (editable install in API image)
└── README.md
```

There is **no** terminal CLI. The **`clip-engine`** package is the engine library; the **`api`** app is the operator entrypoint in production (Docker).
