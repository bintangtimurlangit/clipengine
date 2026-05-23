/**
 * Worker pool.
 *
 * Background loop that drains the SQLite queue. Concurrency is read
 * from the user's `workers` setting (default 1). Each loop iteration
 * tries to claim one queued run via `RunsRepo.claimNextQueued()`,
 * then runs the pipeline inside a per-run AbortController so the
 * cancel route can short-circuit ffmpeg.
 *
 * The pool is intentionally simple: one process, one in-memory
 * semaphore, one polling interval. Scaling later means running more
 * API processes against the same DB; the atomic claim already keeps
 * runs from being processed twice.
 */

import { type DbClient, LogosRepo, PresetsRepo, RunsRepo, SettingsRepo } from '@clipengine/db';
import { type Run, SETTING_KEYS, type WorkerSettings } from '@clipengine/schemas';
import { redactSecrets } from '../lib/redact.js';
import type { RunEventBus } from '../pubsub/run-events.js';
import { RunCancelled, runPipeline } from './pipeline.js';

export interface WorkerPoolOptions {
  db: DbClient;
  bus: RunEventBus;
  /** Workspace root, used by the future source-acquisition stage. */
  workspaceRoot: string;
  /** Where logo binaries live on disk. */
  logosDir: string;
  /**
   * Per-run "where is the source media right now" resolver. Phase 8
   * wires in upload finalize / yt-dlp; for now the route handler
   * stores a path on the run row (in workspace_path/source.*) and
   * the pool walks that. Test-friendly seam.
   *
   * The signal is the per-run AbortController; resolvers should
   * forward it to subprocesses (yt-dlp) so cancel propagates.
   */
  resolveSource: (run: Run, signal: AbortSignal) => Promise<string>;
  /** Polling interval when the queue is empty. Default 1000ms. */
  pollIntervalMs?: number;
}

export class WorkerPool {
  private readonly runs: RunsRepo;
  private readonly presets: PresetsRepo;
  private readonly logos: LogosRepo;
  private readonly settings: SettingsRepo;
  private running = false;
  private inFlight = new Map<string, AbortController>();
  private loopHandle: NodeJS.Timeout | null = null;

  constructor(private readonly options: WorkerPoolOptions) {
    this.runs = new RunsRepo(options.db);
    this.presets = new PresetsRepo(options.db);
    this.logos = new LogosRepo(options.db);
    this.settings = new SettingsRepo(options.db);
  }

  /** Start the polling loop. Idempotent. */
  start(): void {
    if (this.running) return;
    this.running = true;
    void this.tick();
  }

  /**
   * Stop accepting new runs and abort in-flight ones. Returns when
   * every in-flight run has settled into a terminal status.
   */
  async stop(): Promise<void> {
    this.running = false;
    if (this.loopHandle) {
      clearTimeout(this.loopHandle);
      this.loopHandle = null;
    }
    for (const ctrl of this.inFlight.values()) ctrl.abort();
    while (this.inFlight.size > 0) {
      await sleep(50);
    }
  }

  /** Request cancellation of a specific in-flight run. */
  cancel(runId: string): boolean {
    const ctrl = this.inFlight.get(runId);
    if (!ctrl) return false;
    ctrl.abort();
    return true;
  }

  /** Return the count of runs currently being processed. */
  inFlightCount(): number {
    return this.inFlight.size;
  }

  /**
   * Pull configured concurrency from the admin's settings. Falls
   * back to 1 when the setting hasn't been written yet.
   */
  private async readConcurrency(): Promise<number> {
    // Single-admin mode: pick the first user we can find. When we
    // grow into multi-tenant, this becomes per-tenant.
    const adminId = await this.firstUserId();
    if (!adminId) return 1;
    const value = await this.settings.get(adminId, SETTING_KEYS.workers).catch(() => null);
    return (value as WorkerSettings | null)?.concurrency ?? 1;
  }

  private async firstUserId(): Promise<string | null> {
    // Cheap read directly off the db client. We avoid a new repo
    // here because the worker only needs the id.
    const rows = this.options.db.all<{ id: string }>(
      'SELECT id FROM user ORDER BY created_at LIMIT 1' as unknown as never,
    );
    return rows[0]?.id ?? null;
  }

  private schedule(delayMs: number): void {
    if (!this.running) return;
    this.loopHandle = setTimeout(() => {
      void this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    if (!this.running) return;
    try {
      const concurrency = await this.readConcurrency();
      while (this.running && this.inFlight.size < concurrency) {
        const claimed = await this.runs.claimNextQueued();
        if (!claimed) break;
        this.spawn(claimed);
      }
    } catch (err) {
      console.error('[worker-pool] tick failed', err);
    }
    this.schedule(this.options.pollIntervalMs ?? 1000);
  }

  private spawn(run: Run): void {
    const controller = new AbortController();
    this.inFlight.set(run.id, controller);
    void this.execute(run, controller).finally(() => {
      this.inFlight.delete(run.id);
    });
  }

  private async execute(run: Run, controller: AbortController): Promise<void> {
    try {
      // Mark that we're acquiring before the (potentially long)
      // download / live capture starts. The pipeline flips to
      // 'transcribing' itself once the source is in place.
      await this.runs.setStatus(run.id, 'acquiring');
      this.options.bus.emit({ type: 'status', runId: run.id, status: 'acquiring' });
      const sourcePath = await this.options.resolveSource(run, controller.signal);
      await runPipeline(
        {
          db: this.options.db,
          runs: this.runs,
          presets: this.presets,
          logos: this.logos,
          bus: this.options.bus,
          logosDir: this.options.logosDir,
        },
        { run, sourcePath, signal: controller.signal },
      );
    } catch (err) {
      if (err instanceof RunCancelled) {
        await this.runs.markCancelled(run.id);
        this.options.bus.emit({ type: 'cancelled', runId: run.id });
        return;
      }
      const raw = err instanceof Error ? err.message : String(err);
      const message = redactSecrets(raw);
      const code = controller.signal.aborted ? 'cancelled' : 'internal';
      await this.runs.markFailed(run.id, code, message);
      await this.runs.appendLog({
        runId: run.id,
        level: 'error',
        stage: 'lifecycle',
        message,
      });
      this.options.bus.emit({
        type: 'failed',
        runId: run.id,
        errorCode: code,
        errorMessage: message,
      });
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
