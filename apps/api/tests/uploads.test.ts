import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UploadRegistry } from '../src/sources/upload.js';

let stage: string;
let registry: UploadRegistry;

beforeEach(() => {
  stage = mkdtempSync(join(tmpdir(), 'clipengine-upload-'));
  registry = new UploadRegistry(stage);
});

afterEach(() => {
  rmSync(stage, { recursive: true, force: true });
});

describe('UploadRegistry', () => {
  it('rejects total_size out of range', async () => {
    await expect(
      registry.create({ userId: 'u1', filename: 'x.mp4', mime: 'video/mp4', totalSize: 0 }),
    ).rejects.toThrow();
  });

  it('appends chunks until totalSize is reached and finalizes to the destination', async () => {
    const handle = await registry.create({
      userId: 'u1',
      filename: 'demo.mp4',
      mime: 'video/mp4',
      totalSize: 8,
    });
    expect(handle.receivedSize).toBe(0);
    await registry.appendChunk('u1', handle.uploadId, new Uint8Array([1, 2, 3, 4]));
    const after = await registry.appendChunk('u1', handle.uploadId, new Uint8Array([5, 6, 7, 8]));
    expect(after.receivedSize).toBe(8);

    const dest = join(stage, 'final.mp4');
    const out = await registry.finalize('u1', handle.uploadId, dest);
    expect(out).toBe(dest);
    expect(statSync(dest).size).toBe(8);
    const bytes = readFileSync(dest);
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('rejects chunks that overrun the declared total_size', async () => {
    const handle = await registry.create({
      userId: 'u1',
      filename: 'demo.mp4',
      mime: 'video/mp4',
      totalSize: 4,
    });
    await registry.appendChunk('u1', handle.uploadId, new Uint8Array([1, 2, 3, 4]));
    await expect(registry.appendChunk('u1', handle.uploadId, new Uint8Array([5]))).rejects.toThrow(
      /exceeds/,
    );
  });

  it('refuses to finalize an incomplete upload', async () => {
    const handle = await registry.create({
      userId: 'u1',
      filename: 'demo.mp4',
      mime: 'video/mp4',
      totalSize: 4,
    });
    await registry.appendChunk('u1', handle.uploadId, new Uint8Array([1, 2]));
    await expect(
      registry.finalize('u1', handle.uploadId, join(stage, 'final.mp4')),
    ).rejects.toThrow(/incomplete/);
  });

  it('cancel() removes the staging file', async () => {
    const handle = await registry.create({
      userId: 'u1',
      filename: 'demo.mp4',
      mime: 'video/mp4',
      totalSize: 4,
    });
    await registry.appendChunk('u1', handle.uploadId, new Uint8Array([1, 2]));
    await registry.cancel('u1', handle.uploadId);
    expect(registry.get('u1', handle.uploadId)).toBeNull();
  });
});
