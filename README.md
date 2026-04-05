# Clip Engine

**Clip Engine** is a command-line tool that turns a long video (for example a TV episode) into **landscape “longform”** clips and **vertical “shortform”** clips. It uses **faster-whisper** for transcription, an **LLM** to propose cut points, optional **Tavily** web search to ground the plan, and **FFmpeg** to render.

## Features

- **Ingest:** Extract audio, run Whisper, write `transcript.json` and `segments.vtt`.
- **Plan:** Call OpenAI-compatible or Anthropic APIs to produce `cut_plan.json` (longform + shortform windows, titles, rationales). With `TAVILY_API_KEY`, automatically infers identity + highlights queries and searches the web.
- **Render:** Export `longform/` (16:9) and `shortform/` (9:16) MP4s. If `transcript.json` is available beside the plan, trims are **snapped to Whisper segment boundaries** so cuts do not fall mid-utterance.

## Requirements

- **Python** 3.10+
- **FFmpeg** and **FFprobe** on your `PATH`
- **LLM API key** (OpenAI-compatible and/or Anthropic, depending on `LLM_PROVIDER`)
- Optional: **GPU** for faster Whisper; optional **Node.js** (for `npx`) if you use Tavily

## Install

```bash
git clone <repository-url>
cd clip-engine
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -e ".[dev]"
```

Copy `.env.example` to `.env` and fill in API keys.

## Quick start

```bash
# One-shot: transcribe → plan → render (outputs under ./clip_engine_out by default)
clip-engine run-all "path/to/episode.mkv" -o ./my_output --whisper-model base

# Or step by step
clip-engine ingest "path/to/episode.mkv" -o ./my_output
clip-engine plan ./my_output/transcript.json -o ./my_output/cut_plan.json --title "My Show S01E01"
clip-engine render ./my_output/cut_plan.json "path/to/episode.mkv" -o ./my_output/rendered
```

Verbose planning logs (`-v` / `-vv`) go on the **global** option before the subcommand:

```bash
clip-engine -v run-all "path/to/episode.mkv" -o ./my_output
```

## Commands

| Command | Description |
|--------|-------------|
| `ingest` | Audio → Whisper → `transcript.json` + `segments.vtt` |
| `plan` | LLM → `cut_plan.json` |
| `render` | FFmpeg → `longform/*.mp4`, `shortform/*.mp4` |
| `run-all` | `ingest` + `plan` + `render` |

Use `clip-engine <command> --help` for options.

## Environment variables

See **`.env.example`** for the full list. Common entries:

| Variable | Purpose |
|----------|---------|
| `LLM_PROVIDER` | `openai` or `anthropic` |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` | OpenAI-compatible chat API |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` | Anthropic Messages API |
| `TAVILY_API_KEY` | If set, planning runs Tavily (MCP) automatically for video context + highlights |

Optional tuning (defaults match the planner / renderer):

| Variable | Purpose |
|----------|---------|
| `CLIP_ENGINE_LONGFORM_MIN_S` / `CLIP_ENGINE_LONGFORM_MAX_S` | Longform duration bounds after LLM validation |
| `CLIP_ENGINE_SHORTFORM_MIN_S` / `CLIP_ENGINE_SHORTFORM_MAX_S` | Shortform duration bounds |
| `CLIP_ENGINE_SNAP_DURATION_SLACK_S` | Slack (seconds) after transcript snapping vs max duration (default `3`) |

## Documentation

- **[docs/architecture.md](docs/architecture.md)** — pipeline and module map  
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — dev setup and checks  
- **[CHANGELOG.md](CHANGELOG.md)** — release notes  

## License

MIT — see [LICENSE](LICENSE).

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).
