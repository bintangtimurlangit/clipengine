/**
 * Apply pending migrations against a SQLite database.
 *
 * Usage from the API server: `applyMigrations(db, migrationsPath)`
 * during startup. The CLI wrapper (`pnpm db:migrate`) calls this
 * against `DATABASE_URL`.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { DbClient } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Default migrations folder, resolved relative to this file. Works
 * both when running from `src/` (via `tsx`) and from `dist/`.
 */
export const DEFAULT_MIGRATIONS_PATH = resolve(here, 'migrations');

export function applyMigrations(
  db: DbClient,
  migrationsPath: string = DEFAULT_MIGRATIONS_PATH,
): void {
  migrate(db, { migrationsFolder: migrationsPath });
}
