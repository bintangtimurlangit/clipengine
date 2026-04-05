# Clip Engine

**The smartest way to turn long videos into publish-ready clips.** Clip Engine doesn’t just chop on a timer—it **listens**, **understands context**, and **cuts where speech and story actually make sense**.

Built for creators and editors who want **landscape longform** (16:9) and **vertical shortform** (9:16) from a single source—one episode, one pipeline, one CLI.

**Repository:** [github.com/bintangtimurlangit/clipengine](https://github.com/bintangtimurlangit/clipengine)

---

## Why Clip Engine?

| What you get | Why it matters |
|--------------|----------------|
| **Transcript-grounded planning** | Cuts are tied to **real dialogue** from Whisper, not blind timestamps. |
| **LLM editorial brain** | The model **reasons** about hooks, beats, and story arcs—and explains its choices. |
| **Optional web intelligence** | With Tavily, it can **identify the show** and align shorts with **what fans actually discuss** online. |
| **No mid-sentence butcher cuts** | Renders can **snap to Whisper segment boundaries** so you don’t clip someone mid-word. |
| **Your API, your model** | Works with **OpenAI-compatible** APIs **or** **Anthropic**—swap models without changing your workflow. |

---

## How it works

1. **Ingest — hear the video**  
   FFmpeg extracts audio; **faster-whisper** builds a time-coded transcript (`transcript.json`) and WebVTT captions (`segments.vtt`).

2. **Plan — decide what to cut**  
   You choose the backend with `LLM_PROVIDER`:
   - **`openai`** — any **OpenAI-compatible** chat API (OpenAI, Groq, MiniMax OpenAI endpoint, Azure OpenAI-style bases, etc.).
   - **`anthropic`** — **Anthropic Messages** API (Claude, or compatible gateways).

   The model receives the **full timestamped transcript** (plus optional title). If `TAVILY_API_KEY` is set, Clip Engine **automatically** runs a short **foundation pass**: it guesses what video this is, searches the web for **identity** and **community highlights**, then passes that context into the **cut planner**.

3. **Rank & select (inside one smart pass)**  
   There isn’t a separate “dumb” list and reranker—the **same LLM call** is instructed to:
   - Propose **longform** windows (per-scene friendly, bounded duration).
   - Propose **shortform** windows (tight vertical moments, bounded duration).
   - **Prioritize** shorts that match strong beats, quotable lines, or (when web context exists) **fan-favorite themes**—*only where the transcript actually contains that material* (no invented dialogue).
   - Write **rationales** and an **editorial summary** so you can audit *why* each window was chosen.

   After the model responds, **validation** enforces duration bounds, valid timestamps, and clamps to video length—so impossible clips are dropped with clear rules (use `-v` on `plan` / `run-all` to see the full trace).

4. **Render — pixel-perfect outputs**  
   FFmpeg trims the source file, applies **16:9** fit+pad for longform and **9:16** fit + zoom + pad for shortform. If `transcript.json` sits next to `cut_plan.json`, times are **snapped** to segment edges so exports avoid **mid-utterance** trims (with a few seconds of slack so natural in/out points still work).

```text
Video → Whisper transcript → LLM cut plan (+ optional web) → FFmpeg renders
```

---

## Compatibility: OpenAI & Anthropic

| Backend | Configure |
|---------|-----------|
| **OpenAI-compatible** | `LLM_PROVIDER=openai` + `OPENAI_API_KEY`, optional `OPENAI_BASE_URL`, `OPENAI_MODEL` |
| **Anthropic** | `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`, optional `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` |

Both paths use structured JSON output for the cut plan. Pick the **model** that fits your budget and quality bar—**results will differ** by model (reasoning strength, instruction following, and how aggressively it finds shorts).

> **Note:** Clipping **results are not deterministic** across LLM models (and can vary slightly even on the same model). Always preview renders before publishing.

---

## Mid-sentence cuts — how we avoid them

- **Planning** uses transcript **segment timestamps** from Whisper so the LLM anchors windows on real speech.
- **Rendering** optionally **snaps** trim points to **segment boundaries** from `transcript.json`, so FFmpeg doesn’t cut in the middle of a Whisper line. A small duration slack keeps edits natural.

---

## Requirements

| | |
|--|--|
| **Python** | 3.10+ |
| **FFmpeg** + **ffprobe** | On your `PATH` |
| **API keys** | Per your chosen LLM provider (see `.env.example`) |
| **Optional** | GPU for faster Whisper; **Node.js** for Tavily MCP (`npx`) if you use web search |

---

## Basic setup (command line)

### 1. Clone and virtual environment

```bash
git clone https://github.com/bintangtimurlangit/clipengine.git
cd clipengine

python -m venv .venv
```

**Windows (PowerShell or cmd):**

```bat
.venv\Scripts\activate
```

**macOS / Linux:**

```bash
source .venv/bin/activate
```

### 2. Install Clip Engine

```bash
pip install -e ".[dev]"
```

Confirm the CLI:

```bash
clip-engine --help
```

### 3. Environment file

```bash
copy .env.example .env
```

On macOS/Linux use `cp .env.example .env`. Edit `.env` and set at least:

- `LLM_PROVIDER` — `openai` or `anthropic`
- The matching API keys and model names for that provider

Optional: `TAVILY_API_KEY` for automatic web context during planning (requires Node on `PATH` for `npx`).

---

## Commands (cheat sheet)

| Command | What it does |
|--------|----------------|
| `clip-engine ingest <video> -o <dir>` | Transcribe → `transcript.json` + `segments.vtt` |
| `clip-engine plan <transcript.json> -o cut_plan.json` | LLM → `cut_plan.json` |
| `clip-engine render <cut_plan.json> <video> -o <dir>` | FFmpeg → `longform/` + `shortform/` |
| `clip-engine run-all <video> -o <dir>` | All three in order |

**Verbose planning** (raw JSON, prompts with `-vv`, sanitize details): put **`-v` or `-vv` before the subcommand**:

```bash
clip-engine -v run-all "path\to\episode.mkv" -o .\output --whisper-model base
```

**One-shot example:**

```bash
clip-engine run-all "E:\Shows\Episode.mkv" -o .\test_out --whisper-model base
```

**Step by step:**

```bash
clip-engine ingest "Episode.mkv" -o .\out
clip-engine plan .\out\transcript.json -o .\out\cut_plan.json --title "My Show S01E01"
clip-engine render .\out\cut_plan.json "Episode.mkv" -o .\out\rendered
```

Use `clip-engine <command> --help` for all flags (Whisper model, device, title, output paths, etc.).

---

## Environment variables (quick reference)

See **`.env.example`** for the full list. Highlights:

| Variable | Role |
|----------|------|
| `LLM_PROVIDER` | `openai` or `anthropic` |
| `OPENAI_*` / `ANTHROPIC_*` | Keys, base URLs, models |
| `TAVILY_API_KEY` | Enables automatic Tavily search during planning |
| `CLIP_ENGINE_LONGFORM_*` / `CLIP_ENGINE_SHORTFORM_*` | Optional duration tuning |
| `CLIP_ENGINE_SNAP_DURATION_SLACK_S` | Slack after transcript snapping (default `3`) |

---

## Roadmap

Planned and exploratory improvements:

- **Web UI** — browser-based workflow on top of the same engine  
- **Batch / season mode** — queue a **folder** of episodes with consistent naming  
- **Import from YouTube & social** — pull source video **directly** from **YouTube**, **TikTok**, **Instagram**, **X**, and similar (URL in → download → pipeline), subject to each platform’s terms and APIs  
- **Export to YouTube & social** — send finished clips **directly** to those platforms (upload, metadata, platform-specific defaults), alongside saving local files  
- **Thumbnail generation** — auto stills or branded frames per clip  
- **Subtitle generation** — burn-in or sidecar subs from transcript segments  
- **More search providers** — beyond Tavily for richer or alternate web context  

---

## Docs & contributing

- **[docs/commands.md](docs/commands.md)** — full CLI reference (all commands, arguments, options, defaults)  
- **[docs/architecture.md](docs/architecture.md)** — module map and data flow  
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — dev setup, Ruff, pytest  
- **[CHANGELOG.md](CHANGELOG.md)** — release history  

## License

MIT — see [LICENSE](LICENSE).
