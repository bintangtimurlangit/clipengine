/**
 * Runs and their attached log lines + artifact rows.
 *
 * Workspace files (source.mp4, transcript.json, cut_plan.json,
 * rendered/*.mp4, etc.) live on disk; this table just tracks state
 * and metadata. Artifacts hold paths relative to the workspace dir.
 */

import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './auth.js';
import { preset } from './presets.js';

export const run = sqliteTable(
  'run',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** RunStatus enum from `@clipengine/schemas`. */
    status: text('status').notNull(),
    /** SourceType: `upload` | `youtube_vod` | `youtube_live`. */
    sourceType: text('source_type').notNull(),
    /** Full Source descriptor as JSON. */
    source: text('source', { mode: 'json' }).notNull(),
    title: text('title').notNull(),
    presetLongformId: text('preset_longform_id').references(() => preset.id, {
      onDelete: 'set null',
    }),
    presetShortformId: text('preset_shortform_id').references(() => preset.id, {
      onDelete: 'set null',
    }),
    workspacePath: text('workspace_path').notNull(),
    /** Cooperative cancel flag; the worker checks between stages. */
    cancelRequested: integer('cancel_requested', { mode: 'boolean' }).notNull().default(false),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
  },
  (t) => ({
    statusIdx: index('run_status_idx').on(t.status),
    userIdx: index('run_user_idx').on(t.userId),
    queueIdx: index('run_queue_idx').on(t.status, t.createdAt),
  }),
);
export type RunRow = typeof run.$inferSelect;
export type NewRunRow = typeof run.$inferInsert;

export const runLog = sqliteTable(
  'run_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runId: text('run_id')
      .notNull()
      .references(() => run.id, { onDelete: 'cascade' }),
    ts: integer('ts', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
    /** LogLevel: `debug` | `info` | `warn` | `error`. */
    level: text('level').notNull(),
    /** RunStage: `queue` | `acquire` | `ingest` | `research` | `plan` | `render` | `lifecycle`. */
    stage: text('stage').notNull(),
    message: text('message').notNull(),
  },
  (t) => ({
    runTsIdx: index('run_log_run_ts_idx').on(t.runId, t.ts),
  }),
);
export type RunLogRow = typeof runLog.$inferSelect;
export type NewRunLogRow = typeof runLog.$inferInsert;

export const runArtifact = sqliteTable(
  'run_artifact',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => run.id, { onDelete: 'cascade' }),
    /** RunArtifactKind from `@clipengine/schemas`. */
    kind: text('kind').notNull(),
    /** Path relative to the run's workspace directory. */
    path: text('path').notNull(),
    mime: text('mime'),
    size: integer('size'),
    meta: text('meta', { mode: 'json' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    runKindIdx: index('run_artifact_run_kind_idx').on(t.runId, t.kind),
  }),
);
export type RunArtifactRow = typeof runArtifact.$inferSelect;
export type NewRunArtifactRow = typeof runArtifact.$inferInsert;
