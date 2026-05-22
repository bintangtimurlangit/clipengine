/**
 * Better Auth-compatible tables.
 *
 * ClipEngine uses Better Auth for sessions and password hashing. The
 * library expects specific table and column names; we mirror them
 * here so Better Auth and Drizzle stay in sync. The `users.username`
 * column comes from Better Auth's `username` plugin and is what the
 * UI exposes — `email` is required by Better Auth's core but we
 * synthesize one from the username (`<username>@local`) so users
 * never see or enter it.
 *
 * Reference: https://www.better-auth.com/docs/concepts/database
 */

import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  /** Username chosen at registration. Unique. Surfaced in the UI. */
  username: text('username').unique(),
  /** Pre-normalization version of the username. Used for display. */
  displayUsername: text('display_username'),
  /** Synthetic email; Better Auth requires this column. Hidden from UI. */
  email: text('email').notNull().unique(),
  /** Always true: we don't send verification emails in self-host. */
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(true),
  name: text('name'),
  image: text('image'),
  /** `admin` for the first-run user; reserved for future multi-user. */
  role: text('role').notNull().default('admin'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});
export type UserRow = typeof user.$inferSelect;
export type NewUserRow = typeof user.$inferInsert;

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  password: text('password'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});
