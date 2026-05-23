import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_LONGFORM_PRESET, DEFAULT_SHORTFORM_PRESET } from '@clipengine/schemas';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations, createDb, type DbClient } from '../src/index.js';
import { LogosRepo } from '../src/repos/logos.js';
import { PresetsRepo } from '../src/repos/presets.js';
import { RunsRepo } from '../src/repos/runs.js';
import { SettingsRepo } from '../src/repos/settings.js';
import { UsersRepo } from '../src/repos/users.js';
import { user } from '../src/schema/auth.js';

let dbPath: string;
let db: DbClient;

const TEST_USER_ID = 'user_admin';

beforeEach(() => {
  dbPath = join(
    tmpdir(),
    `clipengine-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sqlite`,
  );
  db = createDb({ url: dbPath });
  applyMigrations(db);
  // Seed an admin user so foreign keys are happy.
  db.insert(user)
    .values({
      id: TEST_USER_ID,
      username: 'admin',
      email: 'admin@local',
      role: 'admin',
    })
    .run();
});

afterEach(() => {
  rmSync(dbPath, { force: true });
  rmSync(`${dbPath}-wal`, { force: true });
  rmSync(`${dbPath}-shm`, { force: true });
});

describe('migrations', () => {
  it('creates every expected table', () => {
    const rows = db.all<{ name: string }>(
      // biome-ignore lint/suspicious/noExplicitAny: drizzle's `all<T>` accepts a sql string
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name" as any,
    );
    const names = rows.map((r) => r.name);
    for (const expected of [
      'account',
      'logo',
      'preset',
      'run',
      'run_artifact',
      'run_log',
      'session',
      'setting',
      'user',
      'verification',
    ]) {
      expect(names).toContain(expected);
    }
  });
});

describe('UsersRepo', () => {
  it('counts and finds the seeded admin', async () => {
    const repo = new UsersRepo(db);
    expect(await repo.count()).toBe(1);
    const found = await repo.findByUsername('admin');
    expect(found?.id).toBe(TEST_USER_ID);
  });
});

describe('PresetsRepo', () => {
  it('roundtrips a longform preset through Zod validation', async () => {
    const repo = new PresetsRepo(db);
    const created = await repo.create(TEST_USER_ID, DEFAULT_LONGFORM_PRESET, {
      isDefault: true,
    });
    expect(created.kind).toBe('longform');
    const fetched = await repo.findById(TEST_USER_ID, created.id);
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.dimensions.width).toBe(1920);
  });

  it('lists presets filtered by kind', async () => {
    const repo = new PresetsRepo(db);
    await repo.create(TEST_USER_ID, DEFAULT_LONGFORM_PRESET);
    await repo.create(TEST_USER_ID, DEFAULT_SHORTFORM_PRESET);
    const longform = await repo.listForUser(TEST_USER_ID, { kind: 'longform' });
    const shortform = await repo.listForUser(TEST_USER_ID, { kind: 'shortform' });
    expect(longform).toHaveLength(1);
    expect(shortform).toHaveLength(1);
  });
});

describe('SettingsRepo', () => {
  it('validates settings on write and reads them back', async () => {
    const repo = new SettingsRepo(db);
    await repo.set(TEST_USER_ID, 'workers', { concurrency: 2 });
    const value = await repo.get(TEST_USER_ID, 'workers');
    expect(value?.concurrency).toBe(2);
  });

  it('rejects invalid setting payloads', async () => {
    const repo = new SettingsRepo(db);
    await expect(repo.set(TEST_USER_ID, 'workers', { concurrency: 99 })).rejects.toThrow();
  });
});

describe('LogosRepo', () => {
  it('creates and lists logos for a user', async () => {
    const repo = new LogosRepo(db);
    const created = await repo.create({
      id: 'logo_1',
      userId: TEST_USER_ID,
      filename: 'brand.png',
      mime: 'image/png',
      size: 1234,
      sha256: 'abc',
    });
    expect(created.filename).toBe('brand.png');
    const all = await repo.listForUser(TEST_USER_ID);
    expect(all).toHaveLength(1);
  });
});

describe('RunsRepo', () => {
  it('claims the oldest queued run atomically', async () => {
    const repo = new RunsRepo(db);
    const presets = new PresetsRepo(db);
    const longform = await presets.create(TEST_USER_ID, DEFAULT_LONGFORM_PRESET);

    const first = await repo.create({
      userId: TEST_USER_ID,
      workspacePath: '/tmp/runs/a',
      title: 'first',
      source: { type: 'youtube_vod', url: 'https://youtu.be/aaa11111aaa' },
      presetLongformId: longform.id,
      presetShortformId: null,
    });
    await repo.create({
      userId: TEST_USER_ID,
      workspacePath: '/tmp/runs/b',
      title: 'second',
      source: { type: 'youtube_vod', url: 'https://youtu.be/bbb22222bbb' },
      presetLongformId: longform.id,
      presetShortformId: null,
    });

    const claimed = await repo.claimNextQueued();
    expect(claimed?.id).toBe(first.id);
    expect(claimed?.status).toBe('acquiring');

    const refetched = await repo.findById(TEST_USER_ID, first.id);
    expect(refetched?.status).toBe('acquiring');
  });

  it('returns null when the queue is empty', async () => {
    const repo = new RunsRepo(db);
    expect(await repo.claimNextQueued()).toBeNull();
  });

  it('records logs and artifacts for a run', async () => {
    const repo = new RunsRepo(db);
    const presets = new PresetsRepo(db);
    const longform = await presets.create(TEST_USER_ID, DEFAULT_LONGFORM_PRESET);
    const created = await repo.create({
      userId: TEST_USER_ID,
      workspacePath: '/tmp/runs/x',
      title: 'logs',
      source: { type: 'youtube_vod', url: 'https://youtu.be/xxx33333xxx' },
      presetLongformId: longform.id,
      presetShortformId: null,
    });
    await repo.appendLog({
      runId: created.id,
      level: 'info',
      stage: 'queue',
      message: 'queued',
    });
    await repo.addArtifact({
      runId: created.id,
      kind: 'transcript',
      path: 'transcript.json',
      mime: 'application/json',
      size: 42,
    });
    const logs = await repo.listLogs(created.id);
    const artifacts = await repo.listArtifacts(created.id);
    expect(logs).toHaveLength(1);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.kind).toBe('transcript');
  });
});
