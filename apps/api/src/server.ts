/**
 * `apps/api` server entry point.
 *
 * Boots the SQLite database, runs migrations, builds the Better Auth
 * instance, starts the worker pool, and serves a Hono HTTP server.
 */

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { applyMigrations, createDb } from '@clipengine/db';
import { serve } from '@hono/node-server';
import { buildApp } from './app.js';
import { buildAuth } from './auth.js';
import { loadEnv } from './env.js';
import { workspacePathsFor } from './lib/workspace.js';
import { RunEventBus } from './pubsub/run-events.js';
import { WorkerPool } from './workers/pool.js';

export async function start(): Promise<void> {
  const env = loadEnv();

  const dataDir = resolve(env.CLIPENGINE_DATA_DIR);
  const workspaceRoot = resolve(env.CLIPENGINE_WORKSPACE);
  const logosDir = join(dataDir, 'logos');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(workspaceRoot, { recursive: true });
  mkdirSync(logosDir, { recursive: true });

  const dbPath = join(dataDir, 'clipengine.sqlite');
  const db = createDb({ url: dbPath });
  applyMigrations(db);

  const auth = buildAuth({ db, env });
  const bus = new RunEventBus();
  const pool = new WorkerPool({
    db,
    bus,
    workspaceRoot,
    logosDir,
    resolveSource: async (run) => {
      // Phase 8 wires in upload / yt-dlp acquisition. Until then,
      // the run's workspace is expected to contain a `source.*`
      // file the route handler dropped there.
      const paths = workspacePathsFor(workspaceRoot, run.id);
      return paths.sourceFile('mp4');
    },
  });
  pool.start();

  const app = buildApp({ db, auth, env, bus, pool, logosDir, workspaceRoot });

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
