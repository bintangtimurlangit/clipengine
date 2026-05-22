# `@clipengine/core`

The ClipEngine engine. Pure logic — no HTTP, no DB, no auth.
Takes paths and config in, writes artifact files out.

## Stages

- `ingest/` — `ffmpeg` audio extract, Whisper transcription
  (local via `nodejs-whisper`, OpenAI API, custom OpenAI-compatible).
- `plan/` — LLM cut planner (AI SDK), optional web research with
  Tavily and Brave, segment snapping.
- `render/` — `ffmpeg` encode (16:9 + 9:16), logo overlay,
  subtitle burn-in (libass), thumbnails.

## Design rules

- Take a typed config object; never read `process.env` directly.
- Write all outputs under a workspace directory the caller controls.
- Subprocesses (`ffmpeg`, `yt-dlp`, `whisper.cpp`) are spawned via
  `execa` so cancellation can `SIGTERM` them cleanly.
- Every public function carries TSDoc.


