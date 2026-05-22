# API: Presets

CRUD plus import / export. Every body is validated against
`PresetInputSchema` from `@clipengine/schemas`.

## `GET /api/presets`

```json
{ "presets": [ { "id": "...", "name": "...", "kind": "longform", ... } ] }
```

## `POST /api/presets`

```json
{
  "name": "Vertical highlight",
  "kind": "shortform",
  "orientation": "vertical",
  "dimensions": { "width": 1080, "height": 1920 },
  "duration":   { "min_s": 27, "max_s": 80 },
  "encode": {
    "fps": 30,
    "crf": 20,
    "preset": "medium",
    "audio_bitrate_kbps": 192
  },
  "logo": null,
  "subtitles": {
    "enabled": true,
    "font_family": "DejaVu Sans",
    "font_size_px": 56,
    "primary_color": "#FFFFFF",
    "outline_color": "#000000",
    "outline_width": 3,
    "alignment": "middle_center",
    "margin_v_px": 0,
    "max_lines": 2,
    "safe_area_px": 240
  }
}
```

Returns `201` with the saved preset (now carrying `id` and
`schema_version`).

## `GET /api/presets/:id`

Single preset. 404 if not yours.

## `PATCH /api/presets/:id`

Same body shape as `POST`. Replaces the saved definition.

## `DELETE /api/presets/:id`

Soft response: `200 { "status": "ok" }`. Returns `200` even if the
preset didn't exist (idempotent).

## `GET /api/presets/:id/export`

Returns the preset JSON with
`Content-Disposition: attachment; filename="<slug>.preset.json"`.

## `POST /api/presets/import`

Body is the full preset JSON exported earlier. Server runs
`migratePreset()` from `@clipengine/schemas` (handles any prior
`schema_version`), validates, assigns a fresh `id`, and saves.

Returns `201` with the imported preset and the current
`schema_version`.

If the JSON references a `logo_id` that doesn't exist on this
install, the preset is created with `logo: null` and an info-level
log is emitted (the editor lets the user re-bind).
