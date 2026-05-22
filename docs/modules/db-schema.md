# `db` — schema

Drizzle ORM tables. SQLite first via `better-sqlite3`; the schema is
Postgres-compatible so we can switch backends in cloud without
rewriting application code.

## Tables

| Table | Owns |
|---|---|
| `user` | Better Auth user row. Includes `username` (unique), synthetic `email`, `role` (`admin` for v1), and timestamps. |
| `session` | Better Auth sessions. Token, expires_at, IP, user agent. |
| `account` | Better Auth credential rows. Holds the bcrypt password hash. |
| `verification` | Better Auth verification tokens (unused in v1; kept for future flows). |
| `setting` | Per-user JSON KV. Composite primary key `(user_id, key)`. |
| `logo` | Logo file metadata. Filename, mime, size, sha256. The bytes live on disk. |
| `preset` | Render presets. JSON `definition` validated against `PresetSchema` on every read/write. |
| `run` | One per clipping job. Status, source descriptor, preset references, error fields, timestamps. |
| `run_log` | Append-only log lines per run. Indexed on `(run_id, ts)`. |
| `run_artifact` | Files produced by the pipeline. Path is relative to the run's workspace. |

The full Drizzle definitions are in
[`packages/db/src/schema/`](../../packages/db/src/schema/).

## Indexes

- `run` has `run_status_idx`, `run_user_idx`, and a composite
  `run_queue_idx` on `(status, created_at)` so the worker pool's
  atomic claim is O(log n).
- `run_log` has `(run_id, ts)` for tailing.
- `run_artifact` has `(run_id, kind)` for "list all longform_mp4
  artifacts for this run" lookups.

## Migrations

Initial migration is checked in at
[`packages/db/src/migrations/0000_initial.sql`](../../packages/db/src/migrations/0000_initial.sql).
The api process runs `applyMigrations(db)` on startup; nothing
external is required at deploy time.

To regenerate from the Drizzle schema after a change:

```bash
pnpm --filter @clipengine/db exec drizzle-kit generate
```

Drizzle Kit reads each schema file directly (the `drizzle.config.ts`
lists them explicitly because Kit's bundler can't resolve our
`.js` ESM extensions).

## Repos

`packages/db/src/repos/` holds typed query helpers — one per table.
They're the only thing the application code ever imports; raw
Drizzle queries don't escape the package.

- `UsersRepo` — count + lookup.
- `SettingsRepo` — validates against `SETTING_SCHEMAS` on every
  read and write.
- `LogosRepo` — CRUD.
- `PresetsRepo` — CRUD; validates against `PresetSchema` on read so
  invalid blobs surface at the boundary.
- `RunsRepo` — create, list, lifecycle (markFailed / markCancelled /
  markCompleted), atomic `claimNextQueued()`, plus log + artifact
  helpers.

## Postgres path

The same Drizzle schema works against `pg`. To switch:

1. Move `drizzle-orm/better-sqlite3` -> `drizzle-orm/node-postgres`
   (or your chosen Postgres driver) in `client.ts`.
2. Adjust the `dialect` in `drizzle.config.ts`.
3. Ship the schema once with `drizzle-kit generate`.

The application code is unaware of the underlying engine.
