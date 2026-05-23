import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { moveFile } from '../src/lib/fs-safe.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'clipengine-fs-safe-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('moveFile', () => {
  it('moves a file to a new location on the same device', async () => {
    const src = join(tmp, 'src.bin');
    const sub = join(tmp, 'sub');
    const dest = join(sub, 'dest.bin');
    mkdirSync(sub, { recursive: true });
    writeFileSync(src, Buffer.from('hello'));

    await moveFile(src, dest);

    expect(() => statSync(src)).toThrow(/ENOENT/);
    expect(statSync(dest).size).toBe(5);
    expect(readFileSync(dest, 'utf-8')).toBe('hello');
  });

  it('removes the source file after a successful move', async () => {
    const src = join(tmp, 'src.bin');
    const dest = join(tmp, 'dest.bin');
    writeFileSync(src, Buffer.from('abc'));

    await moveFile(src, dest);

    expect(() => statSync(src)).toThrow(/ENOENT/);
    expect(readFileSync(dest, 'utf-8')).toBe('abc');
  });

  it('preserves file content byte-for-byte', async () => {
    const payload = Buffer.alloc(1024 * 64);
    for (let i = 0; i < payload.length; i++) payload[i] = i % 256;

    const src = join(tmp, 'src.bin');
    const dest = join(tmp, 'dest.bin');
    writeFileSync(src, payload);

    await moveFile(src, dest);

    const moved = readFileSync(dest);
    expect(Buffer.compare(payload, moved)).toBe(0);
  });
});
