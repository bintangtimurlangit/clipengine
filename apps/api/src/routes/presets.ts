/**
 * Preset routes.
 *
 * - GET    /api/presets             — list all presets for the user.
 * - POST   /api/presets             — create one. Validated against
 *                                      PresetInputSchema.
 * - GET    /api/presets/:id         — fetch by id.
 * - PATCH  /api/presets/:id         — replace the definition.
 * - DELETE /api/presets/:id         — delete.
 * - GET    /api/presets/:id/export  — download as JSON.
 * - POST   /api/presets/import      — re-import a previously
 *                                      exported preset (any
 *                                      schema_version, migrated).
 */

import { PresetsRepo } from '@clipengine/db';
import { PRESET_SCHEMA_VERSION, PresetInputSchema, migratePreset } from '@clipengine/schemas';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireUser } from '../middleware/auth.js';
import { validateJson } from '../middleware/validate.js';
import type { AppBindings } from '../types.js';

const ImportSchema = z.unknown();

export const presetRoutes = new Hono<AppBindings>();
presetRoutes.use('*', requireUser);

presetRoutes.get('/', async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'authentication required' });
  const repo = new PresetsRepo(c.get('db'));
  const list = await repo.listForUser(user.id);
  return c.json({ presets: list });
});

presetRoutes.post('/', validateJson(PresetInputSchema), async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'authentication required' });
  const repo = new PresetsRepo(c.get('db'));
  const created = await repo.create(
    user.id,
    c.get('parsedBody') as z.infer<typeof PresetInputSchema>,
  );
  return c.json({ preset: created }, 201);
});

presetRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'authentication required' });
  const repo = new PresetsRepo(c.get('db'));
  const preset = await repo.findById(user.id, c.req.param('id'));
  if (!preset) throw new HTTPException(404, { message: 'preset not found' });
  return c.json({ preset });
});

presetRoutes.patch('/:id', validateJson(PresetInputSchema), async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'authentication required' });
  const repo = new PresetsRepo(c.get('db'));
  try {
    const updated = await repo.update(
      user.id,
      c.req.param('id'),
      c.get('parsedBody') as z.infer<typeof PresetInputSchema>,
    );
    return c.json({ preset: updated });
  } catch (err) {
    if (err instanceof Error && err.message.includes('not found')) {
      throw new HTTPException(404, { message: err.message });
    }
    throw err;
  }
});

presetRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'authentication required' });
  const repo = new PresetsRepo(c.get('db'));
  await repo.deleteById(user.id, c.req.param('id'));
  return c.json({ status: 'ok' });
});

presetRoutes.get('/:id/export', async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'authentication required' });
  const repo = new PresetsRepo(c.get('db'));
  const preset = await repo.findById(user.id, c.req.param('id'));
  if (!preset) throw new HTTPException(404, { message: 'preset not found' });
  c.header('content-disposition', `attachment; filename="${slug(preset.name)}.preset.json"`);
  return c.json(preset);
});

presetRoutes.post('/import', validateJson(ImportSchema), async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'authentication required' });
  let migrated: ReturnType<typeof migratePreset>;
  try {
    migrated = migratePreset(c.get('parsedBody'));
  } catch (err) {
    throw new HTTPException(400, {
      message: err instanceof Error ? err.message : 'invalid preset',
    });
  }
  const repo = new PresetsRepo(c.get('db'));
  // Force a fresh id and the current schema version on import.
  const created = await repo.create(user.id, {
    name: migrated.name,
    kind: migrated.kind,
    orientation: migrated.orientation,
    dimensions: migrated.dimensions,
    duration: migrated.duration,
    encode: migrated.encode,
    logo: migrated.logo,
    subtitles: migrated.subtitles,
  });
  return c.json({ preset: created, schema_version: PRESET_SCHEMA_VERSION }, 201);
});

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'preset'
  );
}
