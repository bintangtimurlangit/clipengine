# `core/render`

The third stage. Walks the cut plan and produces an MP4, JPEG, and
caption per clip per preset.

## Public entry

```ts
runRender({
  source,                  // path to the acquired source video
  workspaceDir,            // run dir; outputs go under rendered/
  cutPlan,                 // CutPlan from runPlan
  transcript,              // for subtitle burn-in
  longformPreset,          // Preset | null
  shortformPreset,         // Preset | null
  logoPaths,               // { [logo_id]: '/data/logos/...' }
  audioStreamIndex?: 0,
  signal?, binaries?,
  onClipStart?, onClipDone?,
}) -> { longform: RenderedClip[], shortform: RenderedClip[] }
```

Per preset:

- Skip when null.
- For each clip in `<kind>_clips`, encode to
  `rendered/<kind>/<NN>_<slug>.mp4`.
- The `onClipStart` / `onClipDone` callbacks let the worker stream
  per-clip progress events to the UI.

## ffmpeg orchestration (`ffmpeg.ts`)

`encodeClip()` composes one ffmpeg call per clip:

- `-i source` — primary input.
- `-i logo.png` — optional, only added when the preset has a logo.
- `-ss <start>` / `-t <duration>` — decode-time seek; multi-audio
  sources don't drop tracks at trim boundaries.
- `-filter_complex` — geometry → optional logo overlay → optional
  subtitle burn-in.
- `-c:v libx264 -preset <p> -crf <c> -pix_fmt yuv420p -r <fps>`
- `-c:a aac -b:a <kbps>k -ac 2 -ar 48000`
- `-movflags +faststart` so MP4s play before they fully load.

After encoding, a second ffmpeg pass pulls a thumbnail at the 1/3
mark; the caption file is written with the clip title + description.

## Geometry (`geometry.ts`)

```
horizontal: scale (fit, lanczos) + pad (letterbox)
vertical:   scale (cover) + crop (center)
```

Forces even dimensions to keep `yuv420p` happy. `setsar=1` keeps
downstream filters from getting confused.

## Logo (`overlay.ts`)

Builds the filter graph fragment that scales the logo to
`scale_pct`% of frame width, applies `colorchannelmixer=aa=<opacity>`
for transparency, and overlays at the configured anchor with
`padding_px` from the nearest edges.

`{ extraInputs: [], filter: '', outputLabel }` when no logo is
configured — the call site composes seamlessly.

## Subtitles (`subtitles.ts`)

Pure ASS file generator. Builds:

- `[Script Info]` block with `PlayResX/Y` matching output dimensions.
- One `[V4+ Styles]` line built from the preset's subtitle config.
  - `#RRGGBB` colors are converted to ASS's `&H00BBGGRR` format.
  - Anchor maps to ASS numpad alignment (1=bottom-left ... 9=top-right).
  - `safe_area_px` is added to `margin_v_px` to keep captions clear
    of platform UI overlays on shortform.
- One `Dialogue:` per transcript segment that overlaps the clip
  window. Timestamps are re-based so the cue starts at zero.

The MP4 burn-in step uses ffmpeg's `subtitles=filename='...'` filter
(libass under the hood). The temp `.ass` is deleted after encode.

## Slugify

`slugify('Why You\'re Wrong (Part 1)') → 'why-you-re-wrong-part-1'`.
ASCII-only via NFKD + combining-mark strip; falls back to `clip` for
empty input. Capped at 40 chars.

## Files

- `geometry.ts` — `buildGeometryFilter`.
- `overlay.ts` — `buildLogoOverlay`.
- `subtitles.ts` — `buildAssSubtitles` + helpers.
- `ffmpeg.ts` — `encodeClip` + thumbnail + caption.
- `index.ts` — `runRender`, `slugify`, re-exports.

## Tests

`packages/core/tests/render.test.ts` covers geometry chain selection,
even-dimension forcing, the no-op overlay path, anchor coordinate
math, ASS color and time formatting, dialogue cue generation with
clip windowing and timestamp rebasing, and the slug edge cases.
Encoding itself is tested at runtime — the full ffmpeg toolchain
isn't a fit for unit tests.
