# `@clipengine/db`

Drizzle ORM layer for ClipEngine. SQLite first, Postgres-compatible
schema so we can switch backends in cloud.

## What lives here

- `schema/` — Drizzle table definitions
  (`auth`, `settings`, `presets`, `logos`, `runs`).
- `migrations/` — generated SQL migrations (Drizzle Kit).
- `repos/` — typed query helpers (`runs`, `presets`, `logos`,
  `settings`, `users`).
- `client.ts` — connection factory; switches between
  `better-sqlite3` and `pg` based on env.


