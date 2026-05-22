/**
 * Run routes.
 *
 * - GET  /api/runs              — list (newest first).
 * - POST /api/runs              — create a queued run. Source
 *                                 acquisition (upload finalize /
 *                                 yt-dlp) lands in Phase 8; for now
 *                                 the route trusts the caller to
 *                                 drop a `source.*` file under the
 *                                 workspace before the worker
 *                                 picks it up.
 * - GET  /api/runs/:id          — single run.
 * - GET  /api/runs/:id/logs     — full run_log for a run.
 * - GET  /api/runs/:id/artifacts — artifact rows the worker
 *                                 produced.
 * - POST /api/runs/:id/cancel   — cooperative cancel: flips the
 *                                 row's flag and aborts the
 *                                 in-flight controller in the pool.
 * - GET  /api/runs/:id/stream   — SSE channel of RunEvent objects
 *                                 keyed to this run.
 */

import { RunsRepo } from '@clipengine/db';
import { type CreateRunInput, CreateRunInputSchema } from '@clipengine/schemas';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { streamSSE } from 'hono/streaming';
import { ensureWorkspace } from '../lib/workspace.js';
import { requireUser } from '../middleware/auth.js';
import { validateJson } from '../middleware/validate.js';
import type { RunEvent, RunEventBus } from '../pubsub/run-events.js';
import type { AppBindings } from '../types.js';
import type { WorkerPool } from '../workers/pool.js';

export interface RunRoutesOptions {
  bus: RunEventBus;
  pool: WorkerPool;
  /** CLIPENGINE_WORKSPACE root. */
  workspaceRoot: string;
}

export function buildRunRoutes(options: RunRoutesOptions): Hono<AppBindings> {
  const router = new Hono<AppBindings>();
  router.use('*', requireUser);

  router.get('/', async (c) => {
    const user = c.get('user');
    if (!user) throw new HTTPException(401, { message: 'authentication required' });
    const repo = new RunsRepo(c.get('db'));
    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? '50'), 1), 200);
    const list = await repo.listForUser(user.id, { limit });
    return c.json({ runs: list });
  });

  router.post('/', validateJson(CreateRunInputSchema), async (c) => {
    const user = c.get('user');
    if (!user) throw new HTTPException(401, { message: 'authentication required' });
    const repo = new RunsRepo(c.get('db'));
    const body = c.get('parsedBody') as CreateRunInput;
    // Allocate the workspace up front so the source-acquisition
    // stage can drop files into a known directory.
    const created = await repo.create({
      userId: user.id,
      workspacePath: '__pending__',
      title: body.title,
      source: body.source,
      presetLongformId: body.preset_longform_id,
      presetShortformId: body.preset_shortform_id,
    });
    const paths = await ensureWorkspace(options.workspaceRoot, created.id);
    // Patch the row with the now-resolved workspace path. Done as a
    // direct UPDATE because the run lifecycle is owned by the
    // worker after this point.
    c.get('db').run(
      `UPDATE run SET workspace_path = '${paths.runDir.replace(/'/g, "''")}' WHERE id = '${created.id}'` as unknown as never,
    );
    return c.json({ run: { ...created, workspace_path: paths.runDir } }, 201);
  });

  router.get('/:id', async (c) => {
    const user = c.get('user');
    if (!user) throw new HTTPException(401, { message: 'authentication required' });
    const repo = new RunsRepo(c.get('db'));
    const run = await repo.findById(user.id, c.req.param('id'));
    if (!run) throw new HTTPException(404, { message: 'run not found' });
    return c.json({ run });
  });

  router.get('/:id/logs', async (c) => {
    const user = c.get('user');
    if (!user) throw new HTTPException(401, { message: 'authentication required' });
    const repo = new RunsRepo(c.get('db'));
    const run = await repo.findById(user.id, c.req.param('id'));
    if (!run) throw new HTTPException(404, { message: 'run not found' });
    const logs = await repo.listLogs(run.id);
    return c.json({ logs });
  });

  router.get('/:id/artifacts', async (c) => {
    const user = c.get('user');
    if (!user) throw new HTTPException(401, { message: 'authentication required' });
    const repo = new RunsRepo(c.get('db'));
    const run = await repo.findById(user.id, c.req.param('id'));
    if (!run) throw new HTTPException(404, { message: 'run not found' });
    const artifacts = await repo.listArtifacts(run.id);
    return c.json({ artifacts });
  });

  router.post('/:id/cancel', async (c) => {
    const user = c.get('user');
    if (!user) throw new HTTPException(401, { message: 'authentication required' });
    const repo = new RunsRepo(c.get('db'));
    const ok = await repo.requestCancel(user.id, c.req.param('id'));
    if (!ok) throw new HTTPException(404, { message: 'run not found' });
    options.pool.cancel(c.req.param('id'));
    return c.json({ status: 'ok' });
  });

  router.get('/:id/stream', async (c) => {
    const user = c.get('user');
    if (!user) throw new HTTPException(401, { message: 'authentication required' });
    const repo = new RunsRepo(c.get('db'));
    const run = await repo.findById(user.id, c.req.param('id'));
    if (!run) throw new HTTPException(404, { message: 'run not found' });

    return streamSSE(c, async (stream) => {
      const queue: RunEvent[] = [];
      let resolveNext: (() => void) | null = null;
      const unsubscribe = options.bus.subscribe(run.id, (evt) => {
        queue.push(evt);
        resolveNext?.();
      });

      stream.onAbort(() => {
        unsubscribe();
        resolveNext?.();
      });

      // Send the current status immediately so reconnects have
      // something to render.
      await stream.writeSSE({
        event: 'status',
        data: JSON.stringify({ runId: run.id, status: run.status }),
      });

      try {
        while (!stream.aborted) {
          if (queue.length === 0) {
            await new Promise<void>((resolve) => {
              resolveNext = resolve;
            });
            resolveNext = null;
            continue;
          }
          const evt = queue.shift();
          if (!evt) continue;
          await stream.writeSSE({
            event: evt.type,
            data: JSON.stringify(evt),
          });
          if (evt.type === 'completed' || evt.type === 'failed' || evt.type === 'cancelled') {
            break;
          }
        }
      } finally {
        unsubscribe();
      }
    });
  });

  return router;
}
