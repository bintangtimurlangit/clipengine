/**
 * Per-user settings routes.
 *
 * GET  /api/settings         — return every setting blob the user
 *                              has saved, keyed by SETTING_KEYS.
 * PATCH /api/settings/:key   — validate and upsert one blob.
 *
 * Each setting is a JSON document validated against its Zod schema
 * by the SettingsRepo before it touches the database.
 */

import { SettingsRepo } from '@clipengine/db';
import { SETTING_KEYS, type SettingKey } from '@clipengine/schemas';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireUser } from '../middleware/auth.js';
import type { AppBindings } from '../types.js';

const ALLOWED_KEYS: SettingKey[] = Object.values(SETTING_KEYS);

export const settingsRoutes = new Hono<AppBindings>();

settingsRoutes.use('*', requireUser);

settingsRoutes.get('/', async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'authentication required' });
  const repo = new SettingsRepo(c.get('db'));
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_KEYS) {
    out[key] = await repo.get(user.id, key);
  }
  return c.json(out);
});

settingsRoutes.patch('/:key', async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'authentication required' });
  const key = c.req.param('key');
  if (!ALLOWED_KEYS.includes(key as SettingKey)) {
    throw new HTTPException(400, { message: `unknown setting key: ${key}` });
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: 'invalid JSON body' });
  }
  const repo = new SettingsRepo(c.get('db'));
  try {
    const value = await repo.set(user.id, key as SettingKey, body);
    return c.json({ key, value });
  } catch (err) {
    throw new HTTPException(400, {
      message: err instanceof Error ? err.message : 'invalid setting payload',
    });
  }
});
