# Changelog

All notable changes to **Clip Engine** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Layout:** `clipengine.pipeline` is a **package** (`src/clipengine/pipeline/`). API code is split into **`clipengine_api/routers/`** and **`clipengine_api/services/`**. Web help lives under **`components/help/`** (no CLI cheat sheet components).
- **Configuration:** No repository **`.env`** / **`.env.example`** and no Docker Compose **`env_file`**. LLM credentials are configured in **Settings** (SQLite); optional process env vars are documented in **`docs/configuration.md`**.

### Removed

- **Typer CLI** (`clip-engine` command). Pipeline entrypoints live in **`clipengine.pipeline`** and are invoked by the **FastAPI** app only.
- Stale local **`build/`** directory (old `python -m build` / setuptools output, including pre-refactor `cli.py`) and the empty **`example/`** folder at the repo root.
- **`python-dotenv`** dependency and **`load_dotenv()`** in the pipeline (no `.env` file loading).

## [0.1.0] - 2026-04-06

### Added

- Initial public release: ingest (FFmpeg + faster-whisper), plan (OpenAI-compatible or Anthropic LLM, optional Tavily MCP), render (longform 16:9, shortform 9:16 with speech-aligned snapping to transcript segments).
