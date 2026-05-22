/**
 * SQLite client factory.
 *
 * ClipEngine ships SQLite for self-host. The schema is also
 * Postgres-compatible — when we move to a hosted offering, the
 * connection layer is the only thing that has to change.
 *
 * The `WAL` journal mode and the matching pragmas keep concurrent
 * reads from blocking writes, which matters because the API and the
 * worker pool open the same database at once.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema/index.js';

export interface DbClientOptions {
  /** Absolute path to the SQLite file. Use `:memory:` for tests. */
  url: string;
  /** Echo SQL to stderr. Off by default. */
  logger?: boolean;
}

export type DbClient = ReturnType<typeof createDb>;

/**
 * Create a Drizzle SQLite client. The returned object exposes the
 * full schema under `client._.fullSchema` for type inference and
 * provides typed query builders for every table.
 */
export function createDb(options: DbClientOptions) {
  const sqlite = new Database(options.url);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('temp_store = MEMORY');
  return drizzle(sqlite, { schema, logger: options.logger ?? false });
}
