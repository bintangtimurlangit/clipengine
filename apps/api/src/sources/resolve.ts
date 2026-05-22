/**
 * Resolve the run's source media right before the pipeline starts.
 *
 * The worker pool calls this once per run; whatever path it returns
 * becomes the engine's `source` argument. Three branches:
 *
 *   - upload: rename the staged file into <run>/source.<ext>.
 *   - youtube_vod: yt-dlp the URL into <run>/source.mp4.
 *   - youtube_live: capture until cancel / max-duration into the
 *     same path. The capture honors the worker's AbortSignal.
 */

import { rename } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { Run, Source } from '@clipengine/schemas';
import { ensureWorkspace } from '../lib/workspace.js';
import type { UploadRegistry } from './upload.js';
import { captureYoutubeLive } from './youtube-live.js';
import { downloadYoutubeVod } from './youtube-vod.js';

export interface ResolveSourceDeps {
  workspaceRoot: string;
  uploads: UploadRegistry;
}

export async function resolveRunSource(
  deps: ResolveSourceDeps,
  run: Run,
  signal: AbortSignal,
): Promise<string> {
  const paths = await ensureWorkspace(deps.workspaceRoot, run.id);
  const source = run.source as Source;

  switch (source.type) {
    case 'upload': {
      const ext = extFromFilename(source.filename) || 'mp4';
      const dest = paths.sourceFile(ext);
      try {
        return await deps.uploads.finalize(run.user_id, source.upload_id, dest);
      } catch (err) {
        // Already finalized on a previous attempt? Fall through to a
        // best-effort move based on the staged file's known location.
        const handle = deps.uploads.get(run.user_id, source.upload_id);
        if (!handle) {
          throw err;
        }
        await rename(handle.stagePath, dest);
        return dest;
      }
    }
    case 'youtube_vod': {
      const dest = paths.sourceFile('mp4');
      await downloadYoutubeVod({ url: source.url, outputPath: dest, signal });
      return dest;
    }
    case 'youtube_live': {
      const dest = paths.sourceFile('mp4');
      await captureYoutubeLive({
        url: source.url,
        outputPath: dest,
        maxDurationS: source.max_duration_s,
        signal,
      });
      return dest;
    }
  }
}

function extFromFilename(filename: string): string {
  const ext = extname(filename).replace(/^\./, '').toLowerCase();
  return ext.length > 0 && ext.length <= 5 ? ext : '';
}

// Exported for tests.
export { join };
