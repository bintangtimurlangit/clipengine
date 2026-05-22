/**
 * Source upload registry.
 *
 * Holds the files produced by chunked uploads in memory until the
 * client calls /finalize. The registry is a tiny in-process Map
 * keyed by user_id + upload_id; once finalized the file is moved
 * into the run's workspace.
 *
 * Chunked uploads are a single-process concept here. The product is
 * a single API process today; if we ever scale to multiple API
 * containers we'll move this to a shared store (or accept that the
 * client must hit the same node for a given upload).
 */

import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export interface UploadHandle {
  uploadId: string;
  userId: string;
  filename: string;
  mime: string;
  totalSize: number;
  receivedSize: number;
  /** Absolute path of the staging file. */
  stagePath: string;
  createdAt: number;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

export class UploadRegistry {
  private readonly stageRoot: string;
  private readonly uploads = new Map<string, UploadHandle>();

  constructor(stageRoot: string) {
    this.stageRoot = resolve(stageRoot);
  }

  async create(input: {
    userId: string;
    filename: string;
    mime: string;
    totalSize: number;
  }): Promise<UploadHandle> {
    if (input.totalSize <= 0 || input.totalSize > MAX_UPLOAD_BYTES) {
      throw new Error(`upload: total_size out of range (1..${MAX_UPLOAD_BYTES})`);
    }
    const uploadId = randomUUID();
    const stagePath = join(this.stageRoot, input.userId, `${uploadId}.part`);
    await mkdir(dirname(stagePath), { recursive: true });
    // Reserve an empty file so resumability is clean.
    await writeFile(stagePath, '');
    const handle: UploadHandle = {
      uploadId,
      userId: input.userId,
      filename: input.filename,
      mime: input.mime,
      totalSize: input.totalSize,
      receivedSize: 0,
      stagePath,
      createdAt: Date.now(),
    };
    this.uploads.set(this.key(input.userId, uploadId), handle);
    return handle;
  }

  /** Append a chunk to the staging file. Returns the new received size. */
  async appendChunk(userId: string, uploadId: string, chunk: Uint8Array): Promise<UploadHandle> {
    const handle = this.uploads.get(this.key(userId, uploadId));
    if (!handle) throw new Error('upload: unknown upload_id');
    if (handle.receivedSize + chunk.byteLength > handle.totalSize) {
      throw new Error('upload: chunk exceeds declared total_size');
    }
    await appendFile(handle.stagePath, chunk);
    handle.receivedSize += chunk.byteLength;
    return handle;
  }

  /**
   * Move the staging file to its final destination and return the
   * final path. The handle is dropped from the registry afterwards.
   */
  async finalize(userId: string, uploadId: string, destination: string): Promise<string> {
    const handle = this.uploads.get(this.key(userId, uploadId));
    if (!handle) throw new Error('upload: unknown upload_id');
    if (handle.receivedSize !== handle.totalSize) {
      throw new Error(`upload: incomplete (received ${handle.receivedSize} / ${handle.totalSize})`);
    }
    await mkdir(dirname(destination), { recursive: true });
    await rename(handle.stagePath, destination);
    this.uploads.delete(this.key(userId, uploadId));
    return destination;
  }

  /** Drop a half-uploaded file. */
  async cancel(userId: string, uploadId: string): Promise<void> {
    const handle = this.uploads.get(this.key(userId, uploadId));
    if (!handle) return;
    await rm(handle.stagePath, { force: true });
    this.uploads.delete(this.key(userId, uploadId));
  }

  get(userId: string, uploadId: string): UploadHandle | null {
    return this.uploads.get(this.key(userId, uploadId)) ?? null;
  }

  private key(userId: string, uploadId: string): string {
    return `${userId}:${uploadId}`;
  }
}
