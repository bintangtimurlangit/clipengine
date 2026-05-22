# Logos

ClipEngine stores logo binaries on disk and references them from
presets by id. PNG, JPEG, WebP, and SVG are accepted up to 5 MB.

## Where they live

| Location | Holds |
|---|---|
| `<DATA_DIR>/logos/<id>.<ext>` | The actual file. |
| `logo` table in SQLite | Metadata: filename, mime, size, sha256, owner. |
| `presets.logo.logo_id` | Reference from a preset to a logo. |

## Uploading

`/logos` has an **Upload logo** button. The browser posts a
multipart form to `POST /api/logos`. The server enforces:

- Allowed mime types: `image/png`, `image/jpeg`, `image/webp`,
  `image/svg+xml`.
- 5 MB max size.
- SHA-256 hash recorded per file (so future "duplicate detection"
  is a one-line query).

## Using a logo in a preset

In the preset editor, set **Logo** to the file you uploaded. The
preset stores `logo: { logo_id, anchor, padding_px, scale_pct,
opacity }`. The renderer:

1. Adds the logo PNG / JPEG as ffmpeg's second input (`-i logo.png`).
2. Scales it to `scale_pct%` of the frame width with Lanczos.
3. Applies the configured opacity via `colorchannelmixer=aa=...`.
4. Composites at the anchor with `padding_px` from the nearest edges.

## Recommendations

- **Format**: PNG with transparency for best edge anti-aliasing.
- **Size**: a 256–512 px wide PNG is plenty; the renderer scales it
  down anyway.
- **Color**: avoid pure black or pure white if you want it to read
  on every background. A slight outline / drop shadow inside the PNG
  itself helps.

## Sharing presets that reference logos

A preset's JSON contains `logo_id` only. Send the JSON to a
collaborator and they'll need to either upload the same logo and
update the id, or rebind via the editor. Embedding the binary in the
JSON would bloat exports without much upside, so we keep them
separate.

## Deleting

`DELETE /api/logos/:id` removes the row and the file. Presets that
referenced it keep the dangling `logo_id`; the renderer treats a
missing file as "no logo" and warns once in the run log. Re-bind in
the editor to fix.
