import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyMigrations, createDb, type DbClient } from '@clipengine/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { buildAuth } from '../src/auth.js';
import type { Env } from '../src/env.js';
import { RunEventBus } from '../src/pubsub/run-events.js';
import { WorkerPool } from '../src/workers/pool.js';

let dbPath: string;
let db: DbClient;
let app: ReturnType<typeof buildApp>;
let pool: WorkerPool;

const env: Env = {
  HOST: '127.0.0.1',
  PORT: 8000,
  CLIPENGINE_DATA_DIR: '.clipengine-data',
  CLIPENGINE_WORKSPACE: '.clipengine-workspace',
  CLIPENGINE_PUBLIC_URL: 'http://localhost:3000',
  CLIPENGINE_AUTH_SECRET: 'test-secret-at-least-sixteen-chars-long',
  CORS_ORIGINS: 'http://localhost:3000',
  NODE_ENV: 'test',
};

beforeEach(() => {
  dbPath = join(
    tmpdir(),
    `clipengine-auth-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sqlite`,
  );
  db = createDb({ url: dbPath });
  applyMigrations(db);
  const auth = buildAuth({ db, env });
  const bus = new RunEventBus();
  pool = new WorkerPool({
    db,
    bus,
    workspaceRoot: '/tmp/cte-ws',
    logosDir: '/tmp/cte-logos',
    resolveSource: async () => '/no/such/source.mp4',
    pollIntervalMs: 1000,
  });
  app = buildApp({
    db,
    auth,
    env,
    bus,
    pool,
    logosDir: '/tmp/cte-logos',
    workspaceRoot: '/tmp/cte-ws',
  });
});

afterEach(async () => {
  await pool?.stop();
  rmSync(dbPath, { force: true });
  rmSync(`${dbPath}-wal`, { force: true });
  rmSync(`${dbPath}-shm`, { force: true });
});

afterEach(() => {
  rmSync(dbPath, { force: true });
  rmSync(`${dbPath}-wal`, { force: true });
  rmSync(`${dbPath}-shm`, { force: true });
});

async function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });
});

describe('GET /api/registration-status', () => {
  it('reports the slot as open when no users exist', async () => {
    const res = await app.request('/api/registration-status');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { open: boolean; admin_count: number };
    expect(body.open).toBe(true);
    expect(body.admin_count).toBe(0);
  });

  it('reports the slot as closed after the admin signs up', async () => {
    const signup = await postJson('/api/auth/sign-up/email', {
      username: 'admin',
      password: 'long-enough-password',
      name: 'admin',
      email: 'admin@clipengine.local',
    });
    if (signup.status !== 200) {
      console.error('signup body:', await signup.text());
    }
    expect(signup.status).toBe(200);

    const res = await app.request('/api/registration-status');
    const body = (await res.json()) as { open: boolean; admin_count: number };
    expect(body.open).toBe(false);
    expect(body.admin_count).toBe(1);
  });
});

describe('auth flow', () => {
  it('signs up an admin and logs them in via username', async () => {
    const signup = await postJson('/api/auth/sign-up/email', {
      username: 'bintang',
      password: 'long-enough-password',
      name: 'bintang',
      email: 'bintang@clipengine.local',
    });
    if (signup.status !== 200) {
      console.error('signup body:', await signup.text());
    }
    expect(signup.status).toBe(200);

    // Sign in with the username plugin endpoint.
    const signin = await postJson('/api/auth/sign-in/username', {
      username: 'bintang',
      password: 'long-enough-password',
    });
    expect(signin.status).toBe(200);

    const cookie = signin.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('clipengine');

    const session = await app.request('/api/auth/get-session', {
      headers: { cookie },
    });
    expect(session.status).toBe(200);
    const body = (await session.json()) as { user?: { username?: string } } | null;
    expect(body?.user?.username).toBe('bintang');
  });

  it('rejects invalid passwords', async () => {
    await postJson('/api/auth/sign-up/email', {
      username: 'admin',
      password: 'long-enough-password',
      name: 'admin',
      email: 'admin@clipengine.local',
    });
    const signin = await postJson('/api/auth/sign-in/username', {
      username: 'admin',
      password: 'wrong-password',
    });
    expect(signin.status).toBeGreaterThanOrEqual(400);
  });
});
