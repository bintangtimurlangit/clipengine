# Preset schema

Canonical JSON shape for a ClipEngine preset. Lives in
[`packages/schemas/src/preset.ts`](../../packages/schemas/src/preset.ts).
This document is the human-readable spec; the Zod schema is the
binding contract.

## Top level

```json
{
  "schema_version": 1,
  "id": "5b9c5e1c-...",
  "name": "Longform 16:9",
  "kind": "longform",
  "orientation": "horizontal",
  "dimensions": { "width": 1920, "height": 1080 },
  "duration":   { "min_s": 180, "max_s": 360 },
  "encode":     { "fps": 30, "crf": 20, "preset": "medium", "audio_bitrate_kbps": 192 },
  "logo":       null,
  "subtitles":  { ... }
}
```

## Fields

### `schema_version` (literal)

Bumped when the shape changes incompatibly. v1 = `1`.
`migratePreset()` forwards older exports through every step up to
the current version on import.

### `id` (uuid)

Server-assigned. Imports get a fresh id automatically.

### `name` (string, 1–80)

Display label.

### `kind` (`'longform' | 'shortform'`)

Drives which array of `cut_plan.json` the renderer pulls from.
Longform clips come from `longform_clips`, shortform from
`shortform_clips`.

### `orientation` (`'horizontal' | 'vertical'`)

Controls the geometry filter chain:

- `horizontal` — scale to fit, pad with letterboxing.
- `vertical` — scale to cover, center-crop.

### `dimensions` (`{ width, height }`)

Output frame in pixels. **Both must be even** (`yuv420p` constraint).
Range 120–7680 wide, 120–4320 tall.

### `duration` (`{ min_s, max_s }`)

In seconds. `max_s >= min_s`. Each cut item is snapped to the
nearest Whisper segment boundary and clamped here. Items shorter
than `min_s` after snapping are dropped; longer items get walked back
to the closest segment end inside the cap.

### `encode`

```json
{
  "fps": 24 | 30 | 60,
  "crf": 14..32,
  "preset": "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow",
  "audio_bitrate_kbps": 64..320
}
```

`crf` lower = higher quality and bigger files. `preset` is the
x264 speed-vs-compression knob.

### `logo` (nullable)

```json
null
```

or:

```json
{
  "logo_id": "<uuid from /api/logos>",
  "anchor": "top_left" | "top_center" | "top_right" |
            "middle_left" | "middle_center" | "middle_right" |
            "bottom_left" | "bottom_center" | "bottom_right",
  "padding_px": 0..400,
  "scale_pct": 1..50,
  "opacity": 0..1
}
```

`scale_pct` is the logo width as a percentage of the frame width.
The renderer preserves aspect ratio. `opacity` translates to
ffmpeg's `colorchannelmixer=aa=<value>` filter.

### `subtitles`

```json
{
  "enabled": true,
  "font_family": "DejaVu Sans",
  "font_size_px": 12..200,
  "primary_color": "#RRGGBB",
  "outline_color": "#RRGGBB",
  "outline_width": 0..20,
  "alignment": "<same enum as logo.anchor>",
  "margin_v_px": 0..800,
  "max_lines": 1..8,
  "safe_area_px": 0..800
}
```

`primary_color` and `outline_color` are `#RRGGBB` only — alpha is
implicit (libass renders fully opaque). `safe_area_px` is added to
`margin_v_px` at render time; treat it as platform-specific (TikTok,
Reels, Shorts) and the margin as preset-style.

## Validation

Zod runs every constraint above on import / save / load. The repo
parses the JSON on read so a malformed blob can never reach the
renderer.
