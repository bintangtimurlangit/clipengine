/**
 * In-memory pub/sub for run progress events.
 *
 * The worker pool publishes events as a run advances; the SSE
 * route subscribes per run-id and forwards the events to the
 * browser. There's no Redis or external broker — the API process
 * is also the worker process, so an in-process bus is enough.
 */

import { EventEmitter } from 'node:events';
import type { RunErrorCode, RunLogEntry, RunStatus } from '@clipengine/schemas';

/** Discriminated event carried over the SSE channel. */
export type RunEvent =
  | { type: 'status'; runId: string; status: RunStatus }
  | { type: 'log'; runId: string; entry: RunLogEntry }
  | { type: 'progress'; runId: string; stage: string; detail: string; percent?: number }
  | {
      type: 'failed';
      runId: string;
      errorCode: RunErrorCode;
      errorMessage: string;
    }
  | { type: 'completed'; runId: string }
  | { type: 'cancelled'; runId: string };

export type RunEventListener = (event: RunEvent) => void;

/**
 * Per-run pub/sub. Subscribers register a callback that receives
 * every event for one run-id. The worker fans out via {@link emit}.
 */
export class RunEventBus {
  private readonly bus = new EventEmitter();

  constructor() {
    // The bus can have many subscribers (one per open SSE client) so
    // bump the default ceiling. Memory leak warnings are unhelpful
    // here.
    this.bus.setMaxListeners(0);
  }

  emit(event: RunEvent): void {
    this.bus.emit(event.runId, event);
  }

  /** Subscribe to a single run. Returns an unsubscribe function. */
  subscribe(runId: string, listener: RunEventListener): () => void {
    this.bus.on(runId, listener);
    return () => {
      this.bus.off(runId, listener);
    };
  }
}
