# `@clipengine/api`

Hono-based HTTP API with an in-process worker pool. Owns:

- REST endpoints (`/api/*`) auto-documented via `@hono/zod-openapi`.
- Better Auth handlers (`/api/auth/*`).
- SSE per-run progress (`/api/runs/:id/stream`).
- The worker pool that drains the SQLite job queue and runs the
  `@clipengine/core` pipeline.
- yt-dlp source acquisition for YouTube VOD and live capture.


