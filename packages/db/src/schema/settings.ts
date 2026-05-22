/**
 * Per-user settings as KV-style JSON blobs. The blob is validated
 * against `SETTING_SCHEMAS` from `@clipengine/schemas` whenever it
 * is read or written.
 *
 * One row per (user_id, key). Keys are restricted to the constants
 * in `SETTING_KEYS` (e.g. `llm`, `transcription`, `search`,
 * `workers`, `onboarding`).
 */

import { sql } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './auth.js';

export const setting = sqliteTable(
  'setting',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    /** JSON-serialized value, validated by schemas package on read/write. */
    value: text('value', { mode: 'json' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.key] }),
  }),
);
export type SettingRow = typeof setting.$inferSelect;
export type NewSettingRow = typeof setting.$inferInsert;
