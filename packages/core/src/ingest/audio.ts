/**
 * Audio extraction + probing helpers.
 *
 * The renderer (and Whisper) wants a 16 kHz mono WAV. ffprobe gives
 * us the source video duration so we can sanity-check cut times
 * before they reach ffmpeg.
 */

import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { runCommand } from '../lib/exec.js';

export interface FFmpegBinaries {
  /** Absolute path or PATH name for ffmpeg. Defaults to `ffmpeg`. */
  ffmpeg?: string;
  /** Absolute path or PATH name for ffprobe. Defaults to `ffprobe`. */
  ffprobe?: string;
}

export interface ProbeOptions {
  source: string;
  binaries?: FFmpegBinaries;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Total duration in seconds, parsed from `ffprobe -show_format`. */
export async function probeDurationSeconds(opts: ProbeOptions): Promise<number> {
  const result = await runCommand(opts.binaries?.ffprobe ?? 'ffprobe', {
    args: [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=nokey=1:noprint_wrappers=1',
      opts.source,
    ],
    signal: opts.signal,
    timeoutMs: opts.timeoutMs ?? 30_000,
  });
  const value = Number.parseFloat(result.stdout.trim());
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`ffprobe: could not parse duration from "${result.stdout.trim()}"`);
  }
  return value;
}

export interface ExtractAudioOptions {
  /** Path to the source video. */
  source: string;
  /** Path to write the WAV file to. Parent dirs are created. */
  output: string;
  /**
   * Which audio stream to use when the source has more than one.
   * Defaults to the first stream (`0`).
   */
  audioStreamIndex?: number;
  binaries?: FFmpegBinaries;
  signal?: AbortSignal;
  /** Timeout for the whole extraction. Default 10 minutes. */
  timeoutMs?: number;
}

/**
 * Extract a 16 kHz mono PCM WAV next to the source. Whisper-friendly.
 *
 * Returns the resolved output path. Overwrites if the file already exists.
 */
export async function extractAudioWav16kMono(opts: ExtractAudioOptions): Promise<string> {
  await mkdir(dirname(opts.output), { recursive: true });
  const streamIndex = opts.audioStreamIndex ?? 0;
  await runCommand(opts.binaries?.ffmpeg ?? 'ffmpeg', {
    args: [
      '-y',
      '-loglevel',
      'error',
      '-i',
      opts.source,
      '-map',
      `0:a:${streamIndex}`,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'pcm_s16le',
      opts.output,
    ],
    signal: opts.signal,
    timeoutMs: opts.timeoutMs ?? 10 * 60_000,
  });
  return opts.output;
}
