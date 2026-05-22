# How ClipEngine works

ClipEngine turns long videos into publish-ready clips by running each
source through three deterministic stages.

```
 ┌──────────┐    ┌────────────┐    ┌─────────────┐    ┌──────────────┐
 │  source  │ -> │   ingest   │ -> │    plan     │ -> │    render    │
 │ upload / │    │ ffmpeg +   │    │ research +  │    │ ffmpeg +     │
 │ youtube  │    │ whisper    │    │ LLM cuts    │    │ subs + logo  │
 └──────────┘    └────────────┘    └─────────────┘    └──────────────┘
                       │                  │                   │
                  transcript.json    cut_plan.json       rendered/*.mp4
```

## Sources

- **Upload** — direct file upload from the browser. Stored under the
  workspace as `source.<ext>`.
- **YouTube VOD** — paste a URL. `yt-dlp` downloads it to the workspace.
- **YouTube live** — paste a livestream URL. `yt-dlp` records to disk
  until the stream ends, you click stop, or the configured maximum
  duration is reached. Then the run flows through ingest like a normal
  VOD.

## Ingest

`ffmpeg` extracts a 16 kHz mono WAV next to the source. The chosen
transcription backend (local Whisper via `whisper.cpp`, OpenAI's
audio API, or any OpenAI-compatible audio endpoint) returns a
normalized `transcript.json` with timed segments.

Default local model: `base` (~150 MB).

## Plan

The planning stage has two halves:

1. **Research (optional).** If you've configured Tavily or Brave,
   ClipEngine generates two queries from the transcript ("what is
   this video?" and "what moments do people care about?") and
   pulls a few results. The summarized text becomes context for
   the planner LLM.
2. **Cut.** The LLM (OpenAI, Anthropic, Minimax, or any
   OpenAI-compatible endpoint) returns a structured `CutPlan` —
   a list of long-form and short-form windows with title, rationale,
   and a draft caption.

ClipEngine then snaps each window to the nearest Whisper segment
boundary so clips don't start or end mid-sentence.

## Render

For every clip in the plan, `ffmpeg` produces:

- An MP4 in the preset's dimensions and orientation
  (16:9 long-form, 9:16 short-form, both customizable).
- A JPEG thumbnail (cropdetect for vertical so black bars don't show).
- A `.caption.txt` next to the MP4 with the title and description
  for downstream upload tools.

Logos are overlaid at the configured anchor with the chosen padding,
scale, and opacity. Subtitles are burned in via libass using the
preset's font, colors, alignment, and safe-area margins.

## Output

All artifacts stay in the run's workspace directory and stream out
through the browser as downloads. There are no upload destinations —
ClipEngine doesn't push to YouTube, S3, or Drive. You take the files
where you want them.
