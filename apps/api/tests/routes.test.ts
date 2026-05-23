import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyMigrations, createDb, type DbClient } from '@clipengine/db';
import {
  DEFAULT_LONGFORM_PRESET,
  SETTING_KEYS,
  type SearchSettings,
  type WorkerSettings,
} from '@clipengine/schemas';
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
    `clipengine-routes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sqlite`,
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

async function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function patchJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function signUpAndSignIn(username = 'admin'): Promise<string> {
  await postJson('/api/auth/sign-up/email', {
    username,
    password: 'long-enough-password',
    name: username,
    email: `${username}@clipengine.local`,
  });
  const signin = await postJson('/api/auth/sign-in/username', {
    username,
    password: 'long-enough-password',
  });
  return signin.headers.get('set-cookie') ?? '';
}

describe('settings routes', () => {
  it('require authentication', async () => {
    const res = await app.request('/api/settings');
    expect(res.status).toBe(401);
  });

  it('round-trip a worker concurrency setting', async () => {
    const cookie = await signUpAndSignIn();
    const value: WorkerSettings = { concurrency: 3 };
    const patched = await patchJson('/api/settings/workers', value, { cookie });
    expect(patched.status).toBe(200);
    const got = await app.request('/api/settings', { headers: { cookie } });
    const body = (await got.json()) as Record<string, unknown>;
    expect(body[SETTING_KEYS.workers]).toEqual({ concurrency: 3 });
  });

  it('rejects invalid setting payloads with 400', async () => {
    const cookie = await signUpAndSignIn();
    const res = await patchJson('/api/settings/workers', { concurrency: 99 }, { cookie });
    expect(res.status).toBe(400);
  });

  it('rejects unknown setting keys with 400', async () => {
    const cookie = await signUpAndSignIn();
    const res = await patchJson('/api/settings/totally-fake', {}, { cookie });
    expect(res.status).toBe(400);
  });
});

describe('onboarding routes', () => {
  it('reports the current state', async () => {
    const cookie = await signUpAndSignIn();
    const res = await app.request('/api/onboarding/state', { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.transcription_configured).toBe(false);
    expect(body.llm_configured).toBe(false);
    expect(body.search_configured).toBe(false);
  });

  it('passes-through a local transcription test', async () => {
    const cookie = await signUpAndSignIn();
    const res = await postJson(
      '/api/onboarding/test/transcription',
      { backend: 'local', model: 'base', language: null },
      { cookie },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('refuses /complete until transcription and LLM are saved', async () => {
    const cookie = await signUpAndSignIn();
    const res = await postJson('/api/onboarding/complete', { search_disabled: true }, { cookie });
    expect(res.status).toBe(400);
  });

  it('lets the user complete onboarding with search disabled', async () => {
    const cookie = await signUpAndSignIn();
    await patchJson(
      '/api/settings/transcription',
      { backend: 'local', model: 'base', language: null },
      { cookie },
    );
    await patchJson(
      '/api/settings/llm',
      {
        primary: {
          id: '00000000-0000-4000-8000-000000000aaa',
          label: 'OpenAI primary',
          provider: 'openai',
          preset: 'openai',
          api_key: 'sk-test',
          model: 'gpt-4o-mini',
        },
        fallbacks: [],
      },
      { cookie },
    );
    const search: SearchSettings = { disabled: true };
    await patchJson('/api/settings/search', search, { cookie });
    const res = await postJson('/api/onboarding/complete', { search_disabled: true }, { cookie });
    expect(res.status).toBe(200);
  });
});

describe('preset routes', () => {
  it('creates, lists, exports, and deletes presets', async () => {
    const cookie = await signUpAndSignIn();
    const create = await postJson('/api/presets', DEFAULT_LONGFORM_PRESET, { cookie });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { preset: { id: string; name: string } };

    const list = await app.request('/api/presets', { headers: { cookie } });
    const listBody = (await list.json()) as { presets: { id: string }[] };
    expect(listBody.presets).toHaveLength(1);

    const exp = await app.request(`/api/presets/${created.preset.id}/export`, {
      headers: { cookie },
    });
    expect(exp.status).toBe(200);
    expect(exp.headers.get('content-disposition')).toContain('attachment');

    const del = await app.request(`/api/presets/${created.preset.id}`, {
      method: 'DELETE',
      headers: { cookie },
    });
    expect(del.status).toBe(200);

    const list2 = await app.request('/api/presets', { headers: { cookie } });
    const list2Body = (await list2.json()) as { presets: unknown[] };
    expect(list2Body.presets).toHaveLength(0);
  });

  it('imports a previously-exported preset and assigns a fresh id', async () => {
    const cookie = await signUpAndSignIn();
    const create = await postJson('/api/presets', DEFAULT_LONGFORM_PRESET, { cookie });
    const created = (await create.json()) as { preset: { id: string } };
    const exported = await app.request(`/api/presets/${created.preset.id}/export`, {
      headers: { cookie },
    });
    const exportedBody = await exported.json();
    const imported = await postJson('/api/presets/import', exportedBody, { cookie });
    expect(imported.status).toBe(201);
    const importedBody = (await imported.json()) as { preset: { id: string } };
    expect(importedBody.preset.id).not.toBe(created.preset.id);
  });
});

describe('runs routes', () => {
  it('require auth', async () => {
    const res = await app.request('/api/runs');
    expect(res.status).toBe(401);
  });

  it('creates a queued run linked to a preset', async () => {
    const cookie = await signUpAndSignIn();
    const presetRes = await postJson('/api/presets', DEFAULT_LONGFORM_PRESET, { cookie });
    const preset = (await presetRes.json()) as { preset: { id: string } };
    const create = await postJson(
      '/api/runs',
      {
        title: 'Demo run',
        source: { type: 'youtube_vod', url: 'https://youtu.be/aaa11111aaa' },
        preset_longform_id: preset.preset.id,
        preset_shortform_id: null,
      },
      { cookie },
    );
    expect(create.status).toBe(201);
    const body = (await create.json()) as {
      run: { id: string; status: string; workspace_path: string };
    };
    expect(body.run.status).toBe('queued');
    expect(body.run.workspace_path).toContain(body.run.id);
  });

  it('rejects runs with no preset', async () => {
    const cookie = await signUpAndSignIn();
    const res = await postJson(
      '/api/runs',
      {
        title: 'no presets',
        source: { type: 'youtube_vod', url: 'https://youtu.be/abc12345xyz' },
        preset_longform_id: null,
        preset_shortform_id: null,
      },
      { cookie },
    );
    expect(res.status).toBe(400);
  });
});
