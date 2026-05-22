# API: Runs

## `POST /api/runs`

Create a queued run.

```json
{
  "title": "Episode 14",
  "source": { "type": "youtube_vod", "url": "https://youtu.be/aaa11111aaa" },
  "preset_longform_id": "5b9c5e1c-...",
  "preset_shortform_id": null
}
```

Source variants:

```json
{ "type": "upload", "upload_id": "<from /api/sources/uploads>", "filename": "episode.mp4" }
{ "type": "youtube_vod", "url": "https://www.youtube.com/watch?v=..." }
{ "type": "youtube_live", "url": "https://www.youtube.com/watch?v=...", "max_duration_s": 7200 }
```

At least one of `preset_longform_id` or `preset_shortform_id` is required.

Returns `201 Created` with the full run row.

## `GET /api/runs`

```bash
GET /api/runs?limit=50
```

Returns the user's runs sorted newest first. Default limit 50, max 200.

## `GET /api/runs/:id`

Single run row. 404 if the user doesn't own it.

## `GET /api/runs/:id/logs`

Append-only `run_log` entries (level / stage / message / timestamp).

## `GET /api/runs/:id/artifacts`

Artifact rows for the run: `kind`, `path` (relative to the run's
workspace), optional `mime` and `size`. The `kind` enum:

```
source                    audio
transcript                cut_plan
render_activity
longform_mp4              longform_thumbnail   longform_caption
shortform_mp4             shortform_thumbnail  shortform_caption
```

## `POST /api/runs/:id/cancel`

Cooperative cancel. Sets `cancel_requested = true` and aborts the
worker's per-run AbortController. The pipeline checks the flag
between stages and SIGTERMs in-flight subprocesses.

## `POST /api/runs/:id/live/stop`

Same effect as cancel, but only valid when `source.type ===
'youtube_live'`. yt-dlp catches SIGTERM and finalizes the recording
into a playable MP4; the run continues into ingest and beyond.

## `GET /api/runs/:id/stream`

Server-Sent Events. See [stream-sse.md](stream-sse.md).
