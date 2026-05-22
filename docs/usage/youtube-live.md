# YouTube live capture

ClipEngine records livestreams with `yt-dlp` and pushes the recording
through the same ingest → plan → render pipeline once it stops.

## How it works

1. The user pastes a livestream URL on the dashboard and starts the
   run.
2. The worker enters `acquiring`. `yt-dlp` runs with
   `--live-from-start`, writing to
   `<WORKSPACE>/runs/<run_id>/source.mp4`.
3. The capture stops when:
   - The stream ends naturally — yt-dlp exits 0.
   - The user clicks **Stop live capture** on the run detail page.
   - The configured `max_duration_s` cap fires (default 7200s, 2 h).
4. yt-dlp catches SIGTERM, finalizes the MP4, and exits.
5. The run continues into `transcribing` and so on.

## Stopping cleanly

The stop button posts `POST /api/runs/:id/live/stop`, which calls the
worker pool's `cancel(runId)`. The per-run AbortController fires;
yt-dlp's stdout buffer flushes; the file is left in a playable state.

## Limitations

- v1 is **record-then-clip**. Clips don't appear until the capture
  finishes. Rolling-chunk live clipping is on the roadmap but not in
  this release.
- The stream goes to a single MP4. Hour-long livestreams produce
  hour-long files, so make sure the workspace volume has room.
- yt-dlp's `--live-from-start` waits for the stream archive to start;
  on some channels there's a short delay before the first byte
  arrives.
- Cookies / authentication for member-only streams are not exposed in
  the UI. Self-hosters can swap in a `--cookies` flag in
  `apps/api/src/sources/youtube-live.ts`.

## Errors

If yt-dlp exits non-zero without a SIGTERM, the run lands in `failed`
with the last 240 chars of stderr in the error message — usually
"This video is private" or "Sign in to confirm your age".
