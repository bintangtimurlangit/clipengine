# `apps/api/routes`

Hono routes mounted under `/api/*`. This page is the codebase tour;
the per-endpoint reference lives under [`docs/api/`](../api/overview.md).

## Layout

```
apps/api/src/
├── server.ts          boot: load env, migrate, build auth, start pool, serve
├── app.ts             buildApp(): mounts every router
├── auth.ts            Better Auth instance + Drizzle adapter + username plugin
├── env.ts             zod-validated process.env
├── types.ts           Hono Variables typing (auth, db, user, session, parsedBody)
├── middleware/
│   ├── auth.ts        sessionMiddleware, requireUser
│   ├── error.ts       ApiError envelope
│   ├── rate-limit.ts  in-process limiter for auth and test probes
│   ├── request-id.ts  x-request-id header
│   └── validate.ts    validateJson(schema) -> sets parsedBody
├── pubsub/
│   └── run-events.ts  in-process EventEmitter keyed by run id
├── lib/
│   ├── redact.ts      log/error secret redaction helpers
│   └── workspace.ts   per-run path helpers
├── workers/
│   ├── pool.ts        the polling loop and concurrency semaphore
│   ├── pipeline.ts    one run end-to-end
│   └── progress.ts    fused log + bus + status writer
├── sources/
│   ├── upload.ts      chunked upload registry
│   ├── youtube-vod.ts yt-dlp VOD download
│   ├── youtube-live.ts yt-dlp live capture
│   └── resolve.ts     dispatch by source.type
└── routes/
    ├── settings.ts    GET / PATCH /api/settings/:key
    ├── onboarding.ts  state + test/{transcription,llm,search} + complete
    ├── presets.ts     CRUD + import/export
    ├── logos.ts       multipart upload + list + delete
    ├── sources.ts     uploads + youtube probe + live stop
    └── runs.ts        list, create, detail, cancel, logs, artifacts, SSE
```

## Conventions

- Routes that mutate state require a session via `requireUser`. The
  health probe and the registration-status gate are public.
- `/api/auth/*` and the onboarding test probes use the in-process
  limiter from `middleware/rate-limit.ts`. It is scoped by client IP
  and route path, and is intentionally small because v1 is a
  single-admin self-host.
- Body validation goes through `validateJson(schema)`; the parsed
  result lands on `c.get('parsedBody')`. Throw 400 for shape errors,
  404 for "not yours / not found", 401 for missing auth.
- Heavy work (file uploads, ffmpeg subprocesses, yt-dlp) is
  offloaded to `workers/` or `sources/`. Routes return quickly.
- Source acquisition is decoupled from the worker via the
  `resolveSource(run, signal)` seam in the pool's options.

## Adding a new route

1. Define the request/response shapes in `@clipengine/schemas` (so
   the same shapes are typed in the web client).
2. Add a router file under `routes/`.
3. Mount it in `app.ts`.
4. Write a vitest case in `apps/api/tests/`.

That's the whole lifecycle.
