/**
 * Logos uploaded by the user. Files live on disk under
 * `<DATA_DIR>/logos/<id>.<ext>`. This row carries the metadata and
 * is referenced by `presets.logoId` (when set).
 */

import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './auth.js';

export const logo = sqliteTable('logo', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  /** SHA-256 hex digest; lets the UI dedupe re-uploads. */
  sha256: text('sha256').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});
export type LogoRow = typeof logo.$inferSelect;
export type NewLogoRow = typeof logo.$inferInsert;
