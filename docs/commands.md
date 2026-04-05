# CLI reference

The main entrypoint is **`clip-engine`** (package `clip_engine`, Typer app).

```bash
clip-engine [GLOBAL OPTIONS] <COMMAND> [COMMAND ARGS]
```

For the most up-to-date help, run:

```bash
clip-engine --help
clip-engine <command> --help
```

---

## Global options

These apply to the **root** `clip-engine` command (before the subcommand).

| Option | Short | Description |
|--------|-------|-------------|
| `--verbose` | `-v` | Repeatable (`-v`, `-vv`). Used by **`plan`** and **`run-all`**: extra LLM output, sanitize report, per-clip rationales; `-vv` also prints system/user prompts (transcript may be truncated in the log). |

**Example:** `clip-engine -v run-all "video.mkv" -o ./out`

---

## `ingest`

Extract 16 kHz mono audio, run **faster-whisper**, write **`transcript.json`** and **`segments.vtt`**.

```bash
clip-engine ingest <VIDEO> [OPTIONS]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `VIDEO` | Path to the input video file. |

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--output-dir`, `-o` | `clip_engine_out` | Directory for `transcript.json`, `segments.vtt`, and `audio_16k_mono.wav`. |
| `--whisper-model` | `base` | Whisper model size (`tiny`, `base`, `small`, `medium`, `large-v2`, …). |
| `--device` | `auto` | Whisper device: `auto` (try CUDA then CPU), `cpu`, or `cuda`. |
| `--compute-type` | `default` | faster-whisper compute type (`default`, `int8`, `float16`, `float32`, …). |
| `--language` | *(auto)* | Optional language code (e.g. `en`) to force Whisper language; omit for auto-detect. |

---

## `plan`

Build **`cut_plan.json`** from a transcript using the configured LLM (see `.env`). If **`TAVILY_API_KEY`** is set, runs the foundation + Tavily pipeline automatically.

```bash
clip-engine [GLOBAL OPTIONS] plan <TRANSCRIPT_JSON> [OPTIONS]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `TRANSCRIPT_JSON` | Path to **`transcript.json`** produced by `ingest`. |

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--output`, `-o` | `<transcript_dir>/cut_plan.json` | Where to write the cut plan JSON. |
| `--title` | *(none)* | Series/episode title or extra context for the LLM. |

### Global interaction

`-v` / `-vv` must appear **before** `plan` (e.g. `clip-engine -v plan ./out/transcript.json`).

---

## `render`

Trim and encode **longform** (16:9) and **shortform** (9:16) MP4s with FFmpeg.

```bash
clip-engine render <CUT_PLAN_JSON> <VIDEO> [OPTIONS]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `CUT_PLAN_JSON` | Path to **`cut_plan.json`** from `plan`. |
| `VIDEO` | Source video (same file as used for `ingest`). |

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--output-dir`, `-o` | `<cut_plan_parent>/rendered` | Output folder for `longform/` and `shortform/` MP4s. |
| `--transcript` | *(auto)* | Path to **`transcript.json`** for segment-snapped trims. If omitted, the default is **`transcript.json` next to `cut_plan.json`** (same directory as the cut plan). |

---

## `run-all`

Run **`ingest`** → **`plan`** → **`render`** in one working directory.

```bash
clip-engine [GLOBAL OPTIONS] run-all <VIDEO> [OPTIONS]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `VIDEO` | Input video file. |

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--output-dir`, `-o` | `clip_engine_out` | Working directory for `transcript.json`, `cut_plan.json`, and `rendered/`. |
| `--title` | *(none)* | Context title passed to the LLM during `plan`. |
| `--whisper-model` | `base` | Same as `ingest --whisper-model`. |
| `--whisper-device` | `auto` | Same as `ingest --device`. |
| `--whisper-compute-type` | `default` | Same as `ingest --compute-type`. |

### Artifacts

Under `-o` / `clip_engine_out`:

| Path | Produced by |
|------|-------------|
| `transcript.json`, `segments.vtt`, `audio_16k_mono.wav` | `ingest` |
| `cut_plan.json` | `plan` |
| `rendered/longform/*.mp4`, `rendered/shortform/*.mp4` | `render` |

### Global interaction

Use **`clip-engine -v run-all ...`** or **`clip-engine -vv run-all ...`** for verbose planning.

---

## Summary table

| Command | Purpose |
|---------|---------|
| `ingest` | Video → transcript + VTT |
| `plan` | Transcript → cut plan JSON |
| `render` | Cut plan + video → MP4 clips |
| `run-all` | All three in sequence |

---

## Environment

`plan` and `run-all` (plan step) require a valid **`.env`** for the LLM (and optionally Tavily). See **`.env.example`** and the **[README](../README.md)**.
