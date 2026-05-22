# Pipeline diagram

ClipEngine runs each source through three deterministic stages.

```
            ┌─────────────────────────────────────────────────────────────┐
            │                       SOURCE                                │
            │   ┌──────────┐    ┌──────────────┐    ┌─────────────────┐   │
            │   │  upload  │    │ yt-dlp VOD   │    │ yt-dlp live cap │   │
            │   └────┬─────┘    └──────┬───────┘    └────────┬────────┘   │
            │        └────────────┬────┴──────────────────────┘           │
            │             writes <run>/source.<ext>                       │
            └──────────────────────────┬──────────────────────────────────┘
                                       ▼
            ┌─────────────────────────────────────────────────────────────┐
            │                        INGEST                               │
            │  ffprobe duration  ─▶  ffmpeg → 16 kHz mono WAV            │
            │  whisper.cpp / OpenAI / OpenAI-compat → transcript.json     │
            └──────────────────────────┬──────────────────────────────────┘
                                       ▼
            ┌─────────────────────────────────────────────────────────────┐
            │                         PLAN                                │
            │  LLM picks identity + highlights queries (when search on)   │
            │  Tavily / Brave search → research context                   │
            │  LLM cut-plan call → longform_clips + shortform_clips       │
            │  snap to whisper segment boundaries → cut_plan.json         │
            └──────────────────────────┬──────────────────────────────────┘
                                       ▼
            ┌─────────────────────────────────────────────────────────────┐
            │                        RENDER                               │
            │  per clip: geometry filter (16:9 fit-pad / 9:16 cover-crop) │
            │            + logo overlay (anchor / scale / opacity)        │
            │            + libass subtitle burn-in                        │
            │            + thumbnail (1/3-mark JPEG)                      │
            │            + caption.txt (title + description)              │
            │  → rendered/longform/<NN>_<slug>.{mp4,jpg,caption.txt}      │
            │  → rendered/shortform/<NN>_<slug>.{mp4,jpg,caption.txt}     │
            └─────────────────────────────────────────────────────────────┘
```

Every arrow is a function call inside `@clipengine/core`. The worker
pool is the only thing that knows about timing, cancellation, and the
SSE event bus.
