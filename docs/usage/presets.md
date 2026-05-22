# Presets

Presets control how a clip is rendered. Each preset is one JSON
document validated against [`PresetSchema`](../reference/preset-schema.md).

ClipEngine ships two when you create your first one yourself or when
the seeder runs: **Longform 16:9** (1920×1080, 3–6 minutes, no logo,
white captions bottom-center) and **Shortform 9:16** (1080×1920, 27–80
seconds, white captions middle-center with a 240 px safe area).

## Anatomy of a preset

| Field | What it does |
|---|---|
| `name` | Display label. |
| `kind` | `longform` or `shortform`. The cut planner respects the kind: longform clips are picked from `longform_clips`, shortform from `shortform_clips`. |
| `orientation` | `horizontal` or `vertical`. Drives the geometry filter chain (fit-pad vs cover-crop). |
| `dimensions` | Output frame in pixels. Both must be even (yuv420p constraint). |
| `duration` | `min_s` and `max_s`. Anything the LLM picks outside the range gets snapped or dropped during the snap step. |
| `encode` | `fps` (24 / 30 / 60), `crf` (14–32, lower = better quality), x264 `preset`, and `audio_bitrate_kbps`. |
| `logo` | `null` for no overlay, or `{ logo_id, anchor, padding_px, scale_pct, opacity }`. The logo PNG comes from the [logos library](logos.md). |
| `subtitles` | Per-preset libass style: font, size, hex colors, outline, alignment, vertical margin, max lines, safe area. |

The full schema lives in [`docs/reference/preset-schema.md`](../reference/preset-schema.md).

## Editing

Visit `/presets` for the list, then **Edit** for any row. The form
groups fields by purpose (identity / dimensions / encoding / logo /
subtitles). Save reposts to `PATCH /api/presets/:id`.

## Logo

Pick a logo from the dropdown after uploading one to the
[logos library](logos.md). The renderer scales it to `scale_pct` of
the frame width, places it at `anchor` with `padding_px` from the
nearest edges, and applies `opacity` via FFmpeg's
`colorchannelmixer=aa=...` filter.

`null` means no overlay; the dropdown picks `— no logo —`.

## Subtitle styling

Per-preset, not global. The default longform style uses 42 px DejaVu
Sans, white fill, black outline, bottom-center alignment, 80 px
margin. The shortform default is bigger (56 px) and middle-aligned
with a 240 px safe area so captions stay clear of TikTok / Reels UI
overlays.

For tighter control:
- `outline_width` controls libass's BorderStyle=1 outline thickness.
- `max_lines` soft-wraps long segments.
- `safe_area_px` is added to `margin_v_px` at render time. Treat the
  safe area as platform-specific (TikTok, Reels, Shorts), and the
  margin as preset-style.

Hex colors are `#RRGGBB` only — alpha is set elsewhere (libass
default is fully opaque).

## Import / export

`/presets/:id/export` downloads the preset as JSON with a
`Content-Disposition: attachment` header. The filename is
`<slugified-name>.preset.json`.

`/presets/new` has an **Import preset JSON** button that posts to
`/api/presets/import`. The server runs `migratePreset()` from
`@clipengine/schemas`, validates, assigns a new id, and saves.

Logo references travel as `logo_id`. If the importer doesn't have
that logo, the resulting preset has `logo: null` and the user has to
rebind from the editor.

## Seeded defaults

The repos do not auto-seed yet — the operator creates presets
explicitly through the UI. Once you create at least one of each kind,
the new-run form lets you mix them per run.
