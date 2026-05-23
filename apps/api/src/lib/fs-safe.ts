import { copyFile, rm, rename } from 'node:fs/promises';

/**
 * Move a file from src to dest. Uses rename() first; falls back to
 * copy + delete when src and dest live on different filesystems (EXDEV).
 */
export async function moveFile(src: string, dest: string): Promise<void> {
  try {
    await rename(src, dest);
  } catch (err) {
    if (isCrossDeviceError(err)) {
      await copyFile(src, dest);
      await rm(src, { force: true });
      return;
    }
    throw err;
  }
}

function isCrossDeviceError(err: unknown): boolean {
  if (err instanceof Error) {
    const nodeErr = err as NodeJS.ErrnoException;
    return nodeErr.code === 'EXDEV';
  }
  return false;
}
