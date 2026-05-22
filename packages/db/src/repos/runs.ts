/**
 * Runs repository.
 *
 * Holds the queue helpers used by the worker pool and the lifecycle
 * helpers used by API routes (create, get, cancel, finish). Logs and
 * artifacts hang off this repo because they are scoped to a run.
 */

import { randomUUID } from 'node:crypto';
import {
  type CreateRunInput,
  type LogLevel,
  type RunArtifact,
  type RunArtifactKind,
  RunArtifactSchema,
  type RunErrorCode,
  type RunLogEntry,
  type RunStage,
  type RunStatus,
  type Source,
  SourceSchema,
} from '@clipengine/schemas';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { DbClient } from '../client.js';
import {
  type RunArtifactRow,
  type RunLogRow,
  type RunRow,
  run,
  runArtifact,
  runLog,
} from '../schema/runs.js';

const toIso = (d: Date | null) => (d ? d.toISOString() : null);

function rowToRun(row: RunRow) {
  return {
    id: row.id,
    user_id: row.userId,
    status: row.status as RunStatus,
    source: SourceSchema.parse(row.source),
    title: row.title,
    preset_longform_id: row.presetLongformId,
    preset_shortform_id: row.presetShortformId,
    workspace_path: row.workspacePath,
    cancel_requested: row.cancelRequested,
    error_code: (row.errorCode as RunErrorCode | null) ?? null,
    error_message: row.errorMessage,
    created_at: row.createdAt.toISOString(),
    started_at: toIso(row.startedAt),
    finished_at: toIso(row.finishedAt),
  };
}

function rowToLogEntry(row: RunLogRow): RunLogEntry {
  return {
    ts: row.ts.toISOString(),
    level: row.level as LogLevel,
    stage: row.stage as RunStage,
    message: row.message,
  };
}

function rowToArtifact(row: RunArtifactRow): RunArtifact {
  return RunArtifactSchema.parse({
    id: row.id,
    run_id: row.runId,
    kind: row.kind as RunArtifactKind,
    path: row.path,
    mime: row.mime ?? undefined,
    size: row.size ?? undefined,
    meta: (row.meta as Record<string, unknown> | null) ?? undefined,
  });
}

export class RunsRepo {
  constructor(private readonly db: DbClient) {}

  /** Create a queued run row. The workspace path must already exist. */
  async create(input: {
    userId: string;
    workspacePath: string;
    title: CreateRunInput['title'];
    source: Source;
    presetLongformId: string | null;
    presetShortformId: string | null;
  }): Promise<ReturnType<typeof rowToRun>> {
    const id = randomUUID();
    this.db
      .insert(run)
      .values({
        id,
        userId: input.userId,
        status: 'queued',
        sourceType: input.source.type,
        source: input.source as unknown,
        title: input.title,
        presetLongformId: input.presetLongformId,
        presetShortformId: input.presetShortformId,
        workspacePath: input.workspacePath,
      })
      .run();
    const fetched = await this.findById(input.userId, id);
    if (!fetched) throw new Error('run: insert returned no rows');
    return fetched;
  }

  async findById(userId: string, id: string) {
    const rows = this.db
      .select()
      .from(run)
      .where(and(eq(run.id, id), eq(run.userId, userId)))
      .all();
    const row = rows[0];
    return row ? rowToRun(row) : null;
  }

  /** Most recent first. Used by the runs list page. */
  async listForUser(userId: string, opts: { limit?: number } = {}) {
    const rows = this.db
      .select()
      .from(run)
      .where(eq(run.userId, userId))
      .orderBy(desc(run.createdAt))
      .limit(opts.limit ?? 100)
      .all();
    return rows.map(rowToRun);
  }

  /**
   * Atomically claim the oldest queued run.
   *
   * Returns the claimed run, or `null` if the queue is empty. The
   * caller is now responsible for advancing status to `acquiring`,
   * `transcribing`, etc. and for releasing on completion / failure.
   */
  async claimNextQueued(): Promise<ReturnType<typeof rowToRun> | null> {
    const row = this.db.transaction((tx) => {
      const rows = tx
        .select({ id: run.id })
        .from(run)
        .where(eq(run.status, 'queued'))
        .orderBy(asc(run.createdAt))
        .limit(1)
        .all();
      const candidate = rows[0];
      if (!candidate) return null;
      const updated = tx
        .update(run)
        .set({ status: 'acquiring', startedAt: new Date() })
        .where(and(eq(run.id, candidate.id), eq(run.status, 'queued')))
        .returning()
        .all();
      return updated[0] ?? null;
    });
    return row ? rowToRun(row) : null;
  }

  async setStatus(id: string, status: RunStatus): Promise<void> {
    this.db.update(run).set({ status }).where(eq(run.id, id)).run();
  }

  async requestCancel(userId: string, id: string): Promise<boolean> {
    const result = this.db
      .update(run)
      .set({ cancelRequested: true })
      .where(and(eq(run.id, id), eq(run.userId, userId)))
      .run();
    return result.changes > 0;
  }

  async markFailed(id: string, errorCode: RunErrorCode, errorMessage: string): Promise<void> {
    this.db
      .update(run)
      .set({
        status: 'failed',
        errorCode,
        errorMessage,
        finishedAt: new Date(),
      })
      .where(eq(run.id, id))
      .run();
  }

  async markCancelled(id: string): Promise<void> {
    this.db
      .update(run)
      .set({
        status: 'cancelled',
        errorCode: 'cancelled',
        errorMessage: 'run cancelled by user',
        finishedAt: new Date(),
      })
      .where(eq(run.id, id))
      .run();
  }

  async markCompleted(id: string): Promise<void> {
    this.db
      .update(run)
      .set({ status: 'completed', finishedAt: new Date() })
      .where(eq(run.id, id))
      .run();
  }

  /* ----------------------------- logs ---------------------------- */

  async appendLog(input: {
    runId: string;
    level: LogLevel;
    stage: RunStage;
    message: string;
  }): Promise<void> {
    this.db
      .insert(runLog)
      .values({
        runId: input.runId,
        level: input.level,
        stage: input.stage,
        message: input.message,
      })
      .run();
  }

  async listLogs(runId: string, opts: { afterId?: number } = {}): Promise<RunLogEntry[]> {
    const where = opts.afterId
      ? and(eq(runLog.runId, runId), sql`${runLog.id} > ${opts.afterId}`)
      : eq(runLog.runId, runId);
    const rows = this.db.select().from(runLog).where(where).orderBy(asc(runLog.ts)).all();
    return rows.map(rowToLogEntry);
  }

  /* --------------------------- artifacts ------------------------- */

  async addArtifact(input: {
    runId: string;
    kind: RunArtifactKind;
    path: string;
    mime?: string;
    size?: number;
    meta?: Record<string, unknown>;
  }): Promise<RunArtifact> {
    const id = randomUUID();
    this.db
      .insert(runArtifact)
      .values({
        id,
        runId: input.runId,
        kind: input.kind,
        path: input.path,
        mime: input.mime ?? null,
        size: input.size ?? null,
        meta: (input.meta as unknown) ?? null,
      })
      .run();
    return RunArtifactSchema.parse({
      id,
      run_id: input.runId,
      kind: input.kind,
      path: input.path,
      mime: input.mime,
      size: input.size,
      meta: input.meta,
    });
  }

  async listArtifacts(runId: string): Promise<RunArtifact[]> {
    const rows = this.db
      .select()
      .from(runArtifact)
      .where(eq(runArtifact.runId, runId))
      .orderBy(asc(runArtifact.createdAt))
      .all();
    return rows.map(rowToArtifact);
  }
}
