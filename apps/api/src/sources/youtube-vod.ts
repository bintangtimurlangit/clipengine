/**
 * yt-dlp wrapper for YouTube VOD downloads.
 *
 * Spawns the system `yt-dlp` binary into the run's workspace
 * directory and writes `source.mp4`. The worker passes its
 * AbortSignal so cancel can SIGTERM the subprocess.
 *
 * Network errors and non-2xx URLs surface as Error throws so the
 * pipeline marks the run failed with a useful message.
 */

import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { runCommand } from '@clipengine/core';

export interface YoutubeVodOptions {
  /** Public YouTube URL (validated upstream). */
  url: string;
  /** Absolute path to write the merged MP4 to. */
  outputPath: string;
  signal?: AbortSignal;
  /** Hard timeout for the download. Default 30 minutes. */
  timeoutMs?: number;
  /** Path or PATH name for yt-dlp. Default `yt-dlp`. */
  binary?: string;
  /** Optional cookies file path; some videos need it. */
  cookiesPath?: string;
}

/**
 * Download a YouTube VOD as a single MP4 (1080p capped).
 *
 * yt-dlp picks the best video + audio inside the format spec, then
 * remuxes (`--merge-output-format mp4`). We cap at 1080p so the
 * downstream renderer doesn't burn cycles on 4K source it would
 * scale away anyway.
 */
export async function downloadYoutubeVod(opts: YoutubeVodOptions): Promise<string> {
  await mkdir(dirname(opts.outputPath), { recursive: true });
  const args = [
    '--no-playlist',
    '--no-progress',
    '--no-warnings',
    '--quiet',
    '--format',
    'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
    '--merge-output-format',
    'mp4',
    '--output',
    opts.outputPath,
  ];
  if (opts.cookiesPath) {
    args.push('--cookies', opts.cookiesPath);
  }
  args.push(opts.url);

  await runCommand(opts.binary ?? 'yt-dlp', {
    args,
    signal: opts.signal,
    timeoutMs: opts.timeoutMs ?? 30 * 60_000,
  });
  return opts.outputPath;
}
