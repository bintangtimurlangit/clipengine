# Architecture

ClipEngine is a TypeScript monorepo with three runtime concerns and one
rule between them: the engine doesn't know about HTTP, the API doesn't
know about ffmpeg, and the web doesn't know about either except through
the typed API client.

```
 ┌────────────────┐    HTTP/SSE    ┌────────────────┐    fn calls    ┌─────────────────┐
 │  apps/web      │ ──────────────▶│  apps/api      │ ─────────────▶│  packages/core  │
 │  Next.js + UI  │                │  Hono + worker │                │  ingest/plan/   │
 │                │ ◀──────────────│                │                │  render         │
 └────────────────┘    SSE events  └────────────────┘    artifacts   └─────────────────┘
                                          │
                                          │ Drizzle
                                          ▼
                                   ┌────────────────┐
                                   │  SQLite        │
                                   │  data + workspace│
                                   └────────────────┘
```

## Packages

| Package | Owns | Depends on |
|---|---|---|
| `@clipengine/schemas` | Zod schemas, the single source of truth for run / preset / settings shapes. | nothing (just `zod`) |
| `@clipengine/db` | Drizzle ORM tables, migrations, and typed repos. SQLite first, Postgres-ready. | `@clipengine/schemas` |
| `@clipengine/llm-providers` | AI SDK adapters for OpenAI, Anthropic, OpenAI-compatible. | `@clipengine/schemas` |
| `@clipengine/search-providers` | Tavily + Brave search adapters. | `@clipengine/schemas` |
| `@clipengine/core` | The engine: ingest, plan, render. Pure logic, no I/O abstractions. | the four above |
| `apps/api` | Hono HTTP server, Better Auth, the in-process worker pool, yt-dlp glue, and the SSE stream. | every package above |
| `apps/web` | Next.js 16 UI. Talks only to `apps/api` via the `/api-engine` reverse proxy. | `@clipengine/schemas` |

## Process model

In v1 the API and the worker pool live in **one Node process**. The
worker pool is a polling loop that atomically claims rows from the
SQLite `run` table and runs each through `runIngest → runPlan →
runRender`. Concurrency is configurable (default 1, max 8) and bounded
by an in-memory semaphore.

Scaling later means running more API processes against a shared
database; the atomic claim already prevents double-processing. We left
the worker as a clean seam so it can move to its own image without
touching application code.

## Data on disk

```
<DATA_DIR>/                          (volume: data)
├── clipengine.sqlite                Better Auth + everything else
├── clipengine.sqlite-{wal,shm}      WAL journal
├── logos/<id>.<ext>                 logo files referenced by presets
└── uploads/<userId>/<id>.part       chunked upload staging

<WORKSPACE>/                         (volume: workspace)
└── runs/<run_id>/
    ├── source.<ext>                 acquired media (upload / yt-dlp)
    ├── audio_16k_mono.wav           ingest
    ├── transcript.json              ingest
    ├── cut_plan.json                plan
    └── rendered/
        ├── longform/<NN>_<slug>.mp4 + .jpg + .caption.txt
        └── shortform/<NN>_<slug>.mp4 + .jpg + .caption.txt
```

Every artifact has a row in `run_artifact` so the UI can list them
without scanning the filesystem.

## Run lifecycle

```
queued → acquiring → transcribing → researching* → planning → rendering → completed
                                                    (*skipped when search disabled)
   ↓                                                                          ↓
   └────────────── failed (terminal) ←──── cancelled (cooperative cancel) ───┘
```

The pipeline checks the per-run `AbortSignal` between stages and
forwards it into ffmpeg / yt-dlp / whisper.cpp subprocesses. Cancel
fires SIGTERM; nothing leaks across the boundary.

## Auth

Better Auth handles passwords (bcrypt), sessions (HTTP-only cookies),
and the `/sign-up/email` + `/sign-in/username` endpoints. ClipEngine
stays single-admin in v1: the registration page is closed once the
first user exists. The `users.role` column already exists for the
multi-user / SaaS-style upgrade path later.

## Why these choices

- **One language.** TypeScript everywhere keeps the type system
  unbroken from the database row to the React form. Better Auth being
  TS-only made this an easy call.
- **In-process worker.** Self-host friction matters more than
  throughput. SQLite + an `EventEmitter` pub/sub avoids Redis or any
  other long-running dependency.
- **File-based artifacts.** The renderer writes plain MP4 / JPEG /
  TXT into a known directory layout. The DB row points at them.
  Backups are just `tar` over the volumes.
- **Engine has no env coupling.** `@clipengine/core` takes a typed
  config object; it never reads `process.env`. The API layer does the
  env parsing and passes settings down.
