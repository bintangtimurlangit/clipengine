/**
 * `@clipengine/db` — Drizzle ORM layer for ClipEngine.
 *
 * SQLite first via `better-sqlite3`. Schema is Postgres-compatible
 * so we can switch backends in cloud without rewriting application
 * code.
 *
 * Public surface:
 *   - {@link createDb} — connection factory.
 *   - Repos under `./repos` for typed CRUD (`RunsRepo`,
 *     `PresetsRepo`, `LogosRepo`, `SettingsRepo`, `UsersRepo`).
 *   - Re-exports of the Drizzle schema under `@clipengine/db/schema`
 *     for use by Better Auth's Drizzle adapter.
 */

export * from './client.js';
export * from './migrate.js';
export * from './repos/index.js';
export * as schema from './schema/index.js';
