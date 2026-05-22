# Workers

ClipEngine runs an in-process worker pool inside the api container.
One pool, one polling loop, one bounded semaphore.

## Concurrency

The pool reads `settings.workers.concurrency` (default 1, max 8).
Each tick claims up to `concurrency - inFlight` queued runs from the
SQLite queue and spawns one per claim under its own AbortController.

## Why bounded

Every active run consumes:

- ~200 MB to ~3 GB of RAM for Whisper, depending on the model.
- Roughly one CPU core for ffmpeg encode (more with `crf` < 18 or the
  `slow` preset).
- One yt-dlp subprocess for live captures or VOD downloads.

Pushing past 1–2 concurrent runs on a typical VPS slows everything
down. The cap is there so the operator can experiment without
bringing the box to its knees.

## Changing the value

Two paths:

1. **Settings → Workers → Save**. The next tick picks up the new
   number.
2. `PATCH /api/settings/workers` with `{ "concurrency": 3 }`.

Existing in-flight runs continue to completion regardless.

## Cancel

`POST /api/runs/:id/cancel` flips `cancel_requested` on the row and
calls `pool.cancel(id)`. The per-run AbortController fires; ffmpeg /
yt-dlp / whisper.cpp all catch SIGTERM and finalize cleanly. The run
lands in `cancelled`.

## Polling interval

Defaults to 1000 ms. Tunable in code only (`pollIntervalMs` on
`WorkerPool`). Sub-second is overkill; the queue rarely sees more
than a handful of runs per minute even with concurrency cranked up.

## Scaling out

Adding more api containers pointed at the same SQLite file is **not
recommended** — better-sqlite3 is single-process. For real scale-out:

1. Switch `@clipengine/db` to Postgres (the schema is compatible).
2. Run multiple api containers behind a load balancer.

Both moves are on the roadmap but not in v1.

## Failures

A failed run lands in `failed` with `error_code` and `error_message`
attached:

| `error_code` | Meaning |
|---|---|
| `source_unreachable` | yt-dlp or upload failed before ingest. |
| `source_too_large` | Caller exceeded `MAX_UPLOAD_BYTES`. |
| `transcription_failed` | Whisper or remote STT errored. |
| `llm_unconfigured` | Settings missing — onboarding incomplete. |
| `llm_failed` | Every profile in the chain returned an error. |
| `search_failed` | Both search providers returned non-result errors. |
| `render_failed` | ffmpeg returned non-zero. |
| `cancelled` | The user (or stop button) aborted the run. |
| `internal` | Anything else. Check the run logs. |

See [`reference/error-codes.md`](../reference/error-codes.md) for
detail.
