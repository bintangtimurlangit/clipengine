# Clip Engine architecture

## Overview

Clip Engine is a **browser-operated pipeline** (plus HTTP API) that turns one episode (or long video) into **landscape longform** and **vertical shortform** clips, using:

1. **Local Whisper** (via `faster-whisper`) for transcription  
2. **An LLM** (OpenAI-compatible chat API or Anthropic Messages) for editorial cut windows  
3. **Optional Tavily** (web search via MCP stdio) to ground planning in show identity and community highlights  
4. **FFmpeg** for audio extraction, probing, and final renders  

### Web UI and Docker (homelab)

For a browser-based entry point on your own hardware, the repo includes **[docker-compose.yml](../docker-compose.yml)** (production) and **[docker-compose.dev.yml](../docker-compose.dev.yml)** (development, hot reload). Details in **[docker.md](docker.md)**.

| Piece | Role |
|-------|------|
| **`apps/web`** | **Next.js** (App Router) + **Tailwind** + **shadcn/ui** — **`/setup`**, **`/`**, **`/import`**, **`/catalog`**, **`/runs`**, **`/library`**, **`/settings`**, **`/automation`**, **`/help`**. The browser calls the API via same-origin **`/api-engine/*`** (proxied to FastAPI). |
| **`apps/api`** | **FastAPI** — setup, **`/api/settings`**, **`/api/runs`** (including **`youtube_live`** capture and **`/api/runs/{id}/live/stop`**), **`/api/import/*`**, **`/api/catalog/*`**, **`/api/s3/*`** (browse + config), **`/api/google-drive/*`**, **`/api/automation`**, **`/api/youtube/*`** (OAuth for upload). Runs the pipeline via **`clipengine.pipeline`** (`run_ingest`, `run_plan`, `run_render`): either **in-process** in a background thread (default, **single-flight** lock so only one run executes at a time), or in **ephemeral Docker worker** containers when **`CLIPENGINE_USE_DOCKER_WORKERS`** is set (concurrent runs, one container per run). Shared body: **`pipeline_execute.execute_pipeline_run`**. **`yt-dlp`** in the API image for YouTube **VOD** and **live** source URLs (live capture runs in **`api`**, not in workers); optional **YouTube Data API** upload after render when the run output destination is YouTube. |
| **Volumes** | **`clipengine_data`** — SQLite (setup admin + pipeline run metadata); **`clipengine_workspace`** — per-run folders under `runs/<id>/` (transcripts, plans, renders) |

**Default Compose** runs **faster-whisper** in the **`api`** process next to FastAPI (one GPU device on **`api`** if you configure it). **Optional:** **`CLIPENGINE_USE_DOCKER_WORKERS`** runs the same pipeline inside **`clipengine-worker`** images spawned by the API (GPU on the **worker** container instead). Long-running Compose services remain **`api`** + **`web`** only; worker containers are **ephemeral** (no `restart: unless-stopped` worker service).

**Automation** (folder watch, cron, webhook) is not implemented yet; the intended model is to **enqueue the same `POST /api/runs` flows** from a future process that watches **`CLIPENGINE_IMPORT_ROOTS`**, runs on a schedule, or accepts signed webhooks. A separate **Redis** queue is optional (retries, back-pressure); ephemeral workers already isolate each run. Details: **[docker.md](docker.md)**.

### Security (homelab)

- **Setup** stores a bcrypt admin password in SQLite; there is **no multi-user auth** in the Web UI yet—treat the stack as **trusted network only** or put it behind a reverse proxy with TLS and access control.
- **Uploads and paths** are confined to the workspace run directory; **directory import** only accepts paths under **`CLIPENGINE_IMPORT_ROOTS`** (plus the workspace root). Do not expose arbitrary host paths without bind mounts you control.
- **YouTube / online sources:** users must comply with **platform terms of service** and local law; the API only automates what you could run locally with `yt-dlp`.
- **Ephemeral workers:** enabling **`CLIPENGINE_USE_DOCKER_WORKERS`** mounts the **Docker socket** into **`api`**, which can start sibling containers on the host. Use only on **trusted** networks; see **[docker.md](docker.md)** and **[SECURITY.md](../SECURITY.md)**.

```
┌─────────┐   ┌──────────────┐   ┌─────────────┐   ┌──────────────┐
│  video  │──▶│ ingest       │──▶│ plan (LLM) │──▶│ render       │
│  file   │   │ Whisper+JSON │   │ cut_plan   │   │ longform/    │
└─────────┘   └──────────────┘   └─────────────┘   │ shortform    │
                                                    └──────────────┘
```

## Data artifacts

| Artifact | Producer | Consumer |
|----------|----------|----------|
| `transcript.json` | `ingest` | `plan`, `render` (snapping) |
| `segments.vtt` | `ingest` | Humans / players |
| `cut_plan.json` | `plan` | `render` |
| `rendered/longform/*.mp4` | `render` | — |
| `rendered/longform/*.jpg` | `render` | — |
| `rendered/shortform/*.mp4` | `render` | — |
| `rendered/shortform/*.jpg` | `render` | — |

## Modules (Python package `clipengine`)

| Module | Role |
|--------|------|
| `pipeline/` | **`run_ingest`**, **`run_plan`**, **`run_render`** (used by the API) |
| `ffmpeg_ops.py` | `ffprobe` duration, WAV extract for Whisper |
| `transcribe.py` | faster-whisper → `TranscriptDoc` |
| `vtt.py` | WebVTT export |
| `llm.py` | Video foundation + cut plan JSON, validation, duration limits |
| `tavily_client.py` | Tavily MCP (`npx -y tavily-mcp`) |
| `models.py` | Pydantic models for transcript and cut plan |
| `segment_snap.py` | Snaps clip times to Whisper segment boundaries (no mid-utterance cuts) |
| `render.py` | FFmpeg filters: 16:9 fit-pad, 9:16 fit + zoom + pad |

## Render presets

- **Longform:** Square-pixel SAR, scale to fit 1920×1080, pad letterbox, 16:9 DAR.  
- **Shortform:** Same containment chain, then zoom factor, crop, pad to 1080×1920, 9:16 DAR (see `render.py`).

## Configuration

LLM and keys: **Settings** in the Web UI (SQLite). Optional process environment variables (Docker `environment:` blocks, shell exports) are documented in **[configuration.md](configuration.md)**—including `clipengine_*` duration limits and `clipengine_SNAP_DURATION_SLACK_S` for post-snap slack.

## Pipeline reference

See **[pipeline.md](pipeline.md)** for stages, artifacts, and configuration.
