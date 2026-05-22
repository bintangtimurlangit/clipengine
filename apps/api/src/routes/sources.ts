/**
 * Source-side routes.
 *
 * Chunked upload (init / chunk / finalize), live-capture stop, and
 * a YouTube URL probe (used by the new-run form to validate before
 * enqueueing).
 *
 * - POST /api/sources/uploads          — start a chunked upload
 * - POST /api/sources/uploads/:id/chunks — append one chunk
 * - POST /api/sources/uploads/:id/cancel — drop a half-uploaded file
 * - GET  /api/sources/uploads/:id      — current handle (for resume)
 * - POST /api/sources/youtube/probe    — sanity-check a URL
 * - POST /api/runs/:id/live/stop       — stop a live capture
 */

import { RunsRepo } from '@clipengine/db';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireUser } from '../middleware/auth.js';
import { validateJson } from '../middleware/validate.js';
import type { UploadRegistry } from '../sources/upload.js';
import type { AppBindings } from '../types.js';
import type { WorkerPool } from '../workers/pool.js';

const InitUploadSchema = z.object({
  filename: z.string().min(1).max(512),
  mime: z.string().min(1).max(128),
  total_size: z.number().int().min(1),
});

const ProbeSchema = z.object({
  url: z
    .string()
    .url()
    .refine(
      (s) => /(?:youtube\.com|youtu\.be)\//i.test(s),
      'must be a youtube.com or youtu.be URL',
    ),
});

export interface SourceRoutesOptions {
  uploads: UploadRegistry;
  pool: WorkerPool;
}

export function buildSourceRoutes(options: SourceRoutesOptions): Hono<AppBindings> {
  const router = new Hono<AppBindings>();
  router.use('*', requireUser);

  router.post('/uploads', validateJson(InitUploadSchema), async (c) => {
    const user = c.get('user');
    if (!user) throw new HTTPException(401, { message: 'authentication required' });
    const body = c.get('parsedBody') as z.infer<typeof InitUploadSchema>;
    try {
      const handle = await options.uploads.create({
        userId: user.id,
        filename: body.filename,
        mime: body.mime,
        totalSize: body.total_size,
      });
      return c.json(
        {
          upload_id: handle.uploadId,
          received_size: handle.receivedSize,
          total_size: handle.totalSize,
        },
        201,
      );
    } catch (err) {
      throw new HTTPException(400, {
        message: err instanceof Error ? err.message : 'unable to start upload',
      });
    }
  });

  router.post('/uploads/:id/chunks', async (c) => {
    const user = c.get('user');
    if (!user) throw new HTTPException(401, { message: 'authentication required' });
    const id = c.req.param('id');
    const handle = options.uploads.get(user.id, id);
    if (!handle) throw new HTTPException(404, { message: 'upload not found' });
    const buffer = await c.req.arrayBuffer();
    if (buffer.byteLength === 0) {
      throw new HTTPException(400, { message: 'empty chunk' });
    }
    try {
      const updated = await options.uploads.appendChunk(user.id, id, new Uint8Array(buffer));
      return c.json({
        upload_id: updated.uploadId,
        received_size: updated.receivedSize,
        total_size: updated.totalSize,
        complete: updated.receivedSize === updated.totalSize,
      });
    } catch (err) {
      throw new HTTPException(400, {
        message: err instanceof Error ? err.message : 'chunk rejected',
      });
    }
  });

  router.post('/uploads/:id/cancel', async (c) => {
    const user = c.get('user');
    if (!user) throw new HTTPException(401, { message: 'authentication required' });
    await options.uploads.cancel(user.id, c.req.param('id'));
    return c.json({ status: 'ok' });
  });

  router.get('/uploads/:id', async (c) => {
    const user = c.get('user');
    if (!user) throw new HTTPException(401, { message: 'authentication required' });
    const handle = options.uploads.get(user.id, c.req.param('id'));
    if (!handle) throw new HTTPException(404, { message: 'upload not found' });
    return c.json({
      upload_id: handle.uploadId,
      received_size: handle.receivedSize,
      total_size: handle.totalSize,
      filename: handle.filename,
      mime: handle.mime,
    });
  });

  router.post('/youtube/probe', validateJson(ProbeSchema), async (c) => {
    // Soft probe: we don't try to fetch metadata here (yt-dlp would
    // be heavyweight for a form click). The schema already enforces
    // the host. Useful seam for future structured metadata.
    const body = c.get('parsedBody') as z.infer<typeof ProbeSchema>;
    return c.json({ ok: true, url: body.url });
  });

  return router;
}

export function buildLiveStopRoute(options: SourceRoutesOptions) {
  const router = new Hono<AppBindings>();
  router.use('*', requireUser);

  router.post('/:id/live/stop', async (c) => {
    const user = c.get('user');
    if (!user) throw new HTTPException(401, { message: 'authentication required' });
    const repo = new RunsRepo(c.get('db'));
    const run = await repo.findById(user.id, c.req.param('id'));
    if (!run) throw new HTTPException(404, { message: 'run not found' });
    if (run.source.type !== 'youtube_live') {
      throw new HTTPException(400, { message: 'run is not a youtube_live capture' });
    }
    options.pool.cancel(run.id);
    return c.json({ status: 'ok' });
  });

  return router;
}
