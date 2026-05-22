/**
 * Logo routes.
 *
 * Stores binaries on disk under `<DATA_DIR>/logos/<id>.<ext>` and
 * carries the metadata (filename, mime, size, sha256) in the
 * `logo` table so presets can reference them.
 *
 * - GET    /api/logos       — list logos for the user
 * - POST   /api/logos       — multipart upload, one file per call
 * - DELETE /api/logos/:id   — remove the row + delete the file
 */

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { LogosRepo } from '@clipengine/db';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireUser } from '../middleware/auth.js';
import type { AppBindings } from '../types.js';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export interface LogoRoutesOptions {
  /** Absolute path to the logos directory under the data volume. */
  logosDir: string;
}

export function buildLogoRoutes(options: LogoRoutesOptions): Hono<AppBindings> {
  const logosRoot = resolve(options.logosDir);
  const router = new Hono<AppBindings>();
  router.use('*', requireUser);

  router.get('/', async (c) => {
    const user = c.get('user');
    if (!user) throw new HTTPException(401, { message: 'authentication required' });
    const repo = new LogosRepo(c.get('db'));
    const list = await repo.listForUser(user.id);
    return c.json({ logos: list });
  });

  router.post('/', async (c) => {
    const user = c.get('user');
    if (!user) throw new HTTPException(401, { message: 'authentication required' });
    const form = await c.req.formData().catch(() => null);
    if (!form) throw new HTTPException(400, { message: 'expected multipart/form-data' });
    const file = form.get('file');
    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: 'missing "file" field' });
    }
    if (!ALLOWED_MIME.has(file.type)) {
      throw new HTTPException(400, { message: `unsupported mime: ${file.type}` });
    }
    if (file.size > MAX_BYTES) {
      throw new HTTPException(413, {
        message: `file too large (max ${MAX_BYTES} bytes)`,
      });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const id = randomUUID();
    const ext = extFor(file.type, file.name);
    const onDisk = join(logosRoot, `${id}.${ext}`);
    await mkdir(logosRoot, { recursive: true });
    await writeFile(onDisk, bytes);

    const repo = new LogosRepo(c.get('db'));
    const row = await repo.create({
      id,
      userId: user.id,
      filename: file.name,
      mime: file.type,
      size: file.size,
      sha256,
    });
    return c.json({ logo: row }, 201);
  });

  router.delete('/:id', async (c) => {
    const user = c.get('user');
    if (!user) throw new HTTPException(401, { message: 'authentication required' });
    const repo = new LogosRepo(c.get('db'));
    const row = await repo.findById(user.id, c.req.param('id'));
    if (!row) throw new HTTPException(404, { message: 'logo not found' });
    await repo.deleteById(user.id, row.id);
    const ext = extFor(row.mime, row.filename);
    const onDisk = join(logosRoot, `${row.id}.${ext}`);
    await rm(onDisk, { force: true });
    return c.json({ status: 'ok' });
  });

  return router;
}

function extFor(mime: string, filename: string): string {
  const fromName = filename.includes('.')
    ? filename.slice(filename.lastIndexOf('.') + 1).toLowerCase()
    : '';
  if (fromName) return fromName;
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/svg+xml':
      return 'svg';
    default:
      return 'bin';
  }
}
