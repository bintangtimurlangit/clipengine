# Clip Engine architecture

## Overview

Clip Engine is a **CLI pipeline** that turns one episode (or long video) into **landscape longform** and **vertical shortform** clips, using:

1. **Local Whisper** (via `faster-whisper`) for transcription  
2. **An LLM** (OpenAI-compatible chat API or Anthropic Messages) for editorial cut windows  
3. **Optional Tavily** (web search via MCP stdio) to ground planning in show identity and community highlights  
4. **FFmpeg** for audio extraction, probing, and final renders  

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
| `rendered/shortform/*.mp4` | `render` | — |

## Modules (Python package `clip_engine`)

| Module | Role |
|--------|------|
| `cli.py` | Typer entrypoint: `ingest`, `plan`, `render`, `run-all` |
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

Environment variables are loaded from `.env` (see `.env.example`). Optional tuning knobs include `CLIP_ENGINE_*` duration limits and `CLIP_ENGINE_SNAP_DURATION_SLACK_S` for post-snap slack.

## CLI

See **[commands.md](commands.md)** for every subcommand, option, and default.
