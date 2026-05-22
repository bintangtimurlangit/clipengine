/**
 * yt-dlp wrapper for YouTube live captures.
 *
 * Records the livestream into a single MP4 until any of the
 * following happens:
 *
 *   1. The stream ends naturally (yt-dlp exits 0).
 *   2. The user clicks "stop" — the worker aborts the per-run
 *      AbortController, which sends SIGTERM. yt-dlp finalizes
 *      the file before exiting.
 *   3. The hard `maxDurationS` cap fires. We arm a timer and
 *      send SIGTERM ourselves so a runaway capture can't fill
 *      the disk forever.
 */

import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { runCommandLossy } from '@clipengine/core';

export interface YoutubeLiveOptions {
  url: string;
  outputPath: string;
  /** Hard cap on capture length in seconds. Default 2 hours. */
  maxDurationS?: number;
  signal?: AbortSignal;
  binary?: string;
  cookiesPath?: string;
  /**
   * Minimum bytes the captured file must contain before we accept
   * it. Tiny outputs usually mean yt-dlp couldn't connect at all.
   */
  minBytes?: number;
}

/**
 * Run a livestream capture. Returns the output path on success.
 *
 * Throws on subprocess errors that aren't a clean SIGTERM. A clean
 * stop (SIGTERM from cancel or the duration cap) is treated as
 * success because yt-dlp still produces a usable MP4.
 */
export async function captureYoutubeLive(opts: YoutubeLiveOptions): Promise<string> {
  await mkdir(dirname(opts.outputPath), { recursive: true });
  const maxMs = (opts.maxDurationS ?? 7200) * 1000;

  // Arm a timer that pipes its own AbortSignal into the subprocess
  // when the cap hits. We chain it with the caller's signal so the
  // worker's cancel still works.
  const timerCtrl = new AbortController();
  const timer = setTimeout(() => timerCtrl.abort(), maxMs);
  const merged = mergeSignals(opts.signal, timerCtrl.signal);

  const args = [
    '--no-playlist',
    '--no-progress',
    '--no-warnings',
    '--quiet',
    '--no-part',
    '--live-from-start',
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

  try {
    const result = await runCommandLossy(opts.binary ?? 'yt-dlp', {
      args,
      signal: merged,
      timeoutMs: maxMs + 60_000, // a small grace window past the cap
    });
    // yt-dlp returns non-zero on SIGTERM; that's our success path.
    if (result.exitCode !== 0 && !merged.aborted) {
      throw new Error(
        `yt-dlp live capture exited ${result.exitCode}: ${result.stderr.trim().slice(0, 240)}`,
      );
    }
  } finally {
    clearTimeout(timer);
  }

  return opts.outputPath;
}

function mergeSignals(...signals: (AbortSignal | undefined)[]): AbortSignal {
  const ctrl = new AbortController();
  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) {
      ctrl.abort();
      break;
    }
    s.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  return ctrl.signal;
}
