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
| **`apps/web`** | **Next.js** (App Router) + **Tailwind** + **shadcn/ui** — **`/setup`**, **`/`**, **`/import`**, **`/runs`**, **`/library`**, **`/settings`**, **`/automation`** (placeholder), **`/help`**. The browser calls the API via same-origin **`/api-engine/*`** (proxied to FastAPI). |
| **`apps/api`** | **FastAPI** — setup, **`/api/settings`**, **`/api/runs`**, **`/api/import/*`**, **`/api/automation`** (stub). Invokes **`clipengine.pipeline`** (`run_ingest`, `run_plan`, `run_render`) in a **background thread** (single-flight lock for MVP). **`yt-dlp`** in the API image for YouTube URLs. |
| **Volumes** | **`clipengine_data`** — SQLite (setup admin + pipeline run metadata); **`clipengine_workspace`** — per-run folders under `runs/<id>/` (transcripts, plans, renders) |

The **Compose** layout runs **faster-whisper inside the `api` image** next to FastAPI (single service, one GPU device if you pass it). **Automation** (folder watch, cron, webhook) is not implemented yet; the intended model is to **enqueue the same `POST /api/runs` flows** from a future worker that either watches **`CLIPENGINE_IMPORT_ROOTS`** paths, runs on a schedule, or accepts signed webhooks. When job concurrency matters, split Whisper to a dedicated **`worker`** service plus a **Redis** (or similar) queue; see **[docker.md](docker.md)**.

### Security (homelab)

- **Setup** stores a bcrypt admin password in SQLite; there is **no multi-user auth** in the Web UI yet—treat the stack as **trusted network only** or put it behind a reverse proxy with TLS and access control.
- **Uploads and paths** are confined to the workspace run directory; **directory import** only accepts paths under **`CLIPENGINE_IMPORT_ROOTS`** (plus the workspace root). Do not expose arbitrary host paths without bind mounts you control.
- **YouTube / online sources:** users must comply with **platform terms of service** and local law; the API only automates what you could run locally with `yt-dlp`.

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
