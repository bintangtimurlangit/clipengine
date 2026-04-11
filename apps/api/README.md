# Clip Engine API

FastAPI service for the homelab Web UI. Run with `uvicorn clipengine_api.main:app` or the `clipengine-api` console script.

The repo-root **`clip-engine`** package is the **engine library** (`clipengine.pipeline`, models, FFmpeg helpers). There is **no** user-facing terminal CLI for the full pipeline. For Docker **ephemeral workers**, the image runs **`python -m clipengine_api.worker <run_id>`** (or the **`clipengine-worker`** console script); see **`docs/docker.md`** in the repo root.

## Local development

Install the **`clip-engine`** package from the repository root first (same environment), then install this package:

```bash
# repo root
pip install -e ".[dev]"
pip install -e "apps/api[dev]"
```

The Docker image installs root `clip-engine` before `clipengine-api`, so no path dependency is required in `pyproject.toml`.
