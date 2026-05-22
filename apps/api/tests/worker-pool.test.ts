import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type DbClient,
  PresetsRepo,
  RunsRepo,
  SettingsRepo,
  applyMigrations,
  createDb,
} from '@clipengine/db';
import {
  DEFAULT_LONGFORM_PRESET,
  type LlmSettings,
  SETTING_KEYS,
  type SearchSettings,
  type TranscriptionSettings,
  type WorkerSettings,
} from '@clipengine/schemas';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { user as userTable } from '../../../packages/db/src/schema/auth.js';
import { type RunEvent, RunEventBus } from '../src/pubsub/run-events.js';
import { WorkerPool } from '../src/workers/pool.js';

const TEST_USER = 'user_admin';

let dbPath: string;
let db: DbClient;
let runs: RunsRepo;
let presets: PresetsRepo;
let settings: SettingsRepo;
let bus: RunEventBus;
let pool: WorkerPool;
let captured: RunEvent[];

const transcription: TranscriptionSettings = {
  backend: 'local',
  model: 'base',
  language: null,
};
const llm: LlmSettings = {
  primary: {
    id: '00000000-0000-4000-8000-0000000000aa',
    label: 'OpenAI primary',
    provider: 'openai',
    preset: 'openai',
    api_key: 'sk-test',
    model: 'gpt-4o-mini',
  },
  fallbacks: [],
};
const search: SearchSettings = { disabled: true };
const workers: WorkerSettings = { concurrency: 1 };

beforeEach(async () => {
  dbPath = join(
    tmpdir(),
    `clipengine-pool-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sqlite`,
  );
  db = createDb({ url: dbPath });
  applyMigrations(db);
  db.insert(userTable)
    .values({ id: TEST_USER, username: 'admin', email: 'admin@local', role: 'admin' })
    .run();

  runs = new RunsRepo(db);
  presets = new PresetsRepo(db);
  settings = new SettingsRepo(db);
  bus = new RunEventBus();

  await settings.set(TEST_USER, SETTING_KEYS.transcription, transcription);
  await settings.set(TEST_USER, SETTING_KEYS.llm, llm);
  await settings.set(TEST_USER, SETTING_KEYS.search, search);
  await settings.set(TEST_USER, SETTING_KEYS.workers, workers);

  captured = [];
});

afterEach(async () => {
  await pool?.stop();
  rmSync(dbPath, { force: true });
  rmSync(`${dbPath}-wal`, { force: true });
  rmSync(`${dbPath}-shm`, { force: true });
});

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('waitFor timed out');
}

describe('WorkerPool', () => {
  it('claims a queued run and marks it failed when the source is missing', async () => {
    const longform = await presets.create(TEST_USER, DEFAULT_LONGFORM_PRESET);
    const run = await runs.create({
      userId: TEST_USER,
      workspacePath: '/tmp/runs/x',
      title: 'Missing source',
      source: { type: 'youtube_vod', url: 'https://youtu.be/aaa11111aaa' },
      presetLongformId: longform.id,
      presetShortformId: null,
    });
    bus.subscribe(run.id, (e) => captured.push(e));

    pool = new WorkerPool({
      db,
      bus,
      workspaceRoot: '/tmp/runs',
      logosDir: '/tmp/logos',
      resolveSource: async () => '/no/such/file.mp4',
      pollIntervalMs: 50,
    });
    pool.start();

    await waitFor(() => captured.some((e) => e.type === 'failed'));

    const fresh = await runs.findById(TEST_USER, run.id);
    expect(fresh?.status).toBe('failed');
    expect(fresh?.error_code).toBe('internal');
  });

  it('cancels an in-flight run when cancel() is called', async () => {
    const longform = await presets.create(TEST_USER, DEFAULT_LONGFORM_PRESET);
    const run = await runs.create({
      userId: TEST_USER,
      workspacePath: '/tmp/runs/y',
      title: 'Slow run',
      source: { type: 'youtube_vod', url: 'https://youtu.be/bbb22222bbb' },
      presetLongformId: longform.id,
      presetShortformId: null,
    });
    bus.subscribe(run.id, (e) => captured.push(e));

    pool = new WorkerPool({
      db,
      bus,
      workspaceRoot: '/tmp/runs',
      logosDir: '/tmp/logos',
      resolveSource: async (r) => {
        // Pretend source acquisition takes a while; check signal.
        await new Promise((resolve) => setTimeout(resolve, 200));
        return `/no/such/source-${r.id}.mp4`;
      },
      pollIntervalMs: 50,
    });
    pool.start();

    await waitFor(() => pool.inFlightCount() > 0);
    expect(pool.cancel(run.id)).toBe(true);
    await waitFor(() => captured.some((e) => e.type === 'cancelled' || e.type === 'failed'));

    const fresh = await runs.findById(TEST_USER, run.id);
    expect(['cancelled', 'failed']).toContain(fresh?.status);
  });

  it('processes runs in FIFO order respecting concurrency', async () => {
    const longform = await presets.create(TEST_USER, DEFAULT_LONGFORM_PRESET);
    const a = await runs.create({
      userId: TEST_USER,
      workspacePath: '/tmp/runs/a',
      title: 'A',
      source: { type: 'youtube_vod', url: 'https://youtu.be/aaaaaaaaaaa' },
      presetLongformId: longform.id,
      presetShortformId: null,
    });
    const b = await runs.create({
      userId: TEST_USER,
      workspacePath: '/tmp/runs/b',
      title: 'B',
      source: { type: 'youtube_vod', url: 'https://youtu.be/bbbbbbbbbbb' },
      presetLongformId: longform.id,
      presetShortformId: null,
    });

    const order: string[] = [];
    pool = new WorkerPool({
      db,
      bus,
      workspaceRoot: '/tmp/runs',
      logosDir: '/tmp/logos',
      resolveSource: async (r) => {
        order.push(r.id);
        return '/no/such/source.mp4';
      },
      pollIntervalMs: 50,
    });
    pool.start();

    await waitFor(() => order.length === 2, 5000);
    expect(order[0]).toBe(a.id);
    expect(order[1]).toBe(b.id);
  });
});
