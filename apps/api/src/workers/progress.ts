/**
 * Progress writer.
 *
 * Helper used by every pipeline stage. Wraps a {@link RunsRepo} and
 * a {@link RunEventBus} so the pipeline doesn't need to know that
 * "log a line" actually means "append a row to run_log AND publish
 * to subscribers".
 */

import type { RunsRepo } from '@clipengine/db';
import type { LogLevel, RunErrorCode, RunStage, RunStatus } from '@clipengine/schemas';
import type { RunEventBus } from '../pubsub/run-events.js';

export interface ProgressWriter {
  log(level: LogLevel, stage: RunStage, message: string): Promise<void>;
  setStatus(status: RunStatus): Promise<void>;
  progress(stage: RunStage, detail: string, percent?: number): void;
  fail(code: RunErrorCode, message: string): Promise<void>;
  cancel(): Promise<void>;
  complete(): Promise<void>;
}

export interface ProgressWriterOptions {
  runId: string;
  runs: RunsRepo;
  bus: RunEventBus;
}

export function createProgressWriter(options: ProgressWriterOptions): ProgressWriter {
  const { runId, runs, bus } = options;

  return {
    async log(level, stage, message) {
      await runs.appendLog({ runId, level, stage, message });
      bus.emit({
        type: 'log',
        runId,
        entry: {
          ts: new Date().toISOString(),
          level,
          stage,
          message,
        },
      });
    },
    async setStatus(status) {
      await runs.setStatus(runId, status);
      bus.emit({ type: 'status', runId, status });
    },
    progress(stage, detail, percent) {
      bus.emit({ type: 'progress', runId, stage, detail, percent });
    },
    async fail(errorCode, errorMessage) {
      await runs.markFailed(runId, errorCode, errorMessage);
      bus.emit({ type: 'failed', runId, errorCode, errorMessage });
    },
    async cancel() {
      await runs.markCancelled(runId);
      bus.emit({ type: 'cancelled', runId });
    },
    async complete() {
      await runs.markCompleted(runId);
      bus.emit({ type: 'completed', runId });
    },
  };
}
