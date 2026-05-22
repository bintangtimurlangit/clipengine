/**
 * Render presets owned by a user. The full preset definition lives
 * in `definition` as a JSON blob validated against the `Preset`
 * schema from `@clipengine/schemas`.
 *
 * `kind` is duplicated as a column (vs only in JSON) so we can
 * filter "all longform presets" without parsing every blob.
 */

import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './auth.js';

export const preset = sqliteTable('preset', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['longform', 'shortform'] }).notNull(),
  schemaVersion: integer('schema_version').notNull(),
  /** Validated against `PresetSchema` on every read/write. */
  definition: text('definition', { mode: 'json' }).notNull(),
  /** True for the default preset of each kind for this user. */
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});
export type PresetRow = typeof preset.$inferSelect;
export type NewPresetRow = typeof preset.$inferInsert;
