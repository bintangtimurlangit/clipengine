/**
 * `apps/api` server entry point.
 *
 * Boots the SQLite database, runs migrations, builds the Better Auth
 * instance, and starts a Hono HTTP server. The whole pipeline lives
 * in this single file so `tsx watch src/server.ts` is the only thing
 * the developer needs to run for the API.
 */

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { applyMigrations, createDb } from '@clipengine/db';
import { serve } from '@hono/node-server';
import { buildApp } from './app.js';
import { buildAuth } from './auth.js';
import { loadEnv } from './env.js';

export async function start(): Promise<void> {
  const env = loadEnv();

  const dataDir = resolve(env.CLIPENGINE_DATA_DIR);
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(resolve(env.CLIPENGINE_WORKSPACE), { recursive: true });

  const dbPath = join(dataDir, 'clipengine.sqlite');
  const db = createDb({ url: dbPath });
  applyMigrations(db);

  const auth = buildAuth({ db, env });
  const app = buildApp({ db, auth, env });

  serve({ fetch: app.fetch, hostname: env.HOST, port: env.PORT }, (info) => {
    console.log(`[clipengine-api] listening on http://${info.address}:${info.port}`);
  });
}

const isMain =
  typeof import.meta.url === 'string' &&
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  start().catch((err) => {
    console.error('[clipengine-api] failed to start', err);
    process.exitCode = 1;
  });
}
