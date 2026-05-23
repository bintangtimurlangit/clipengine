/**
 * Per-clip ffmpeg encode.
 *
 * Composes geometry + logo overlay + subtitle burn-in for one clip,
 * using decode-time `-ss` so trim boundaries land cleanly even on
 * sources with non-default audio tracks. Writes the output MP4 plus
 * a JPEG thumbnail and a plain-text caption next to it.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type {
  ClipItem,
  Dimensions,
  EncodeConfig,
  Orientation,
  Preset,
  TranscriptDoc,
} from '@clipengine/schemas';
import { runCommand } from '../lib/exec.js';
import { buildGeometryFilter } from './geometry.js';
import { buildLogoOverlay, type LogoOverlayInput } from './overlay.js';
import { buildAssSubtitles } from './subtitles.js';

export interface FFmpegBinaries {
  ffmpeg?: string;
  ffprobe?: string;
}

export interface EncodeClipOptions {
  /** Source video path. */
  source: string;
  /** Where to write the rendered MP4. */
  output: string;
  /** The cut window. */
  clip: ClipItem;
  preset: Preset;
  /** Transcript used for subtitle burn-in (when subtitles are enabled). */
  transcript: TranscriptDoc;
  /** Resolved on-disk path to the logo PNG, or null when no logo. */
  logoPath: string | null;
  /** Which audio stream to mux. Defaults to 0. */
  audioStreamIndex?: number;
  binaries?: FFmpegBinaries;
  signal?: AbortSignal;
  /** Hard timeout for the encode. Default 30 minutes. */
  timeoutMs?: number;
}

export interface EncodeClipResult {
  /** Output MP4 path. */
  videoPath: string;
  /** JPEG thumbnail path (`<output basename>.jpg`). */
  thumbnailPath: string;
  /** Caption text path (`<output basename>.caption.txt`). */
  captionPath: string;
  /** Effective duration in seconds (after preset clamping). */
  durationS: number;
}

/**
 * Encode a single clip end-to-end. Side effects:
 *   1. ffmpeg writes the MP4.
 *   2. A second ffmpeg pass extracts a JPEG thumbnail.
 *   3. The caption text file is written.
 */
export async function encodeClip(opts: EncodeClipOptions): Promise<EncodeClipResult> {
  const output = resolve(opts.output);
  await mkdir(dirname(output), { recursive: true });

  const ffmpegBin = opts.binaries?.ffmpeg ?? 'ffmpeg';
  const audioIndex = opts.audioStreamIndex ?? 0;
  const startS = Math.max(0, opts.clip.start_s);
  const durationS = Math.max(0.1, opts.clip.end_s - opts.clip.start_s);

  // Optional subtitle prep: write the ASS to a temp file next to the
  // output. We always clean it up afterward.
  let assPath: string | null = null;
  if (opts.preset.subtitles.enabled) {
    assPath = `${output}.subs.ass`;
    const ass = buildAssSubtitles({
      transcript: opts.transcript,
      config: opts.preset.subtitles,
      dimensions: opts.preset.dimensions,
      startOffsetS: startS,
      durationS,
    });
    await writeFile(assPath, ass, 'utf-8');
  }

  const filter = buildClipFilter({
    orientation: opts.preset.orientation,
    dimensions: opts.preset.dimensions,
    logo:
      opts.logoPath && opts.preset.logo
        ? {
            path: opts.logoPath,
            config: opts.preset.logo,
            dimensions: opts.preset.dimensions,
          }
        : null,
    assPath,
  });

  const args: string[] = [
    '-y',
    '-loglevel',
    'error',
    // Decode-time seek: open the file, then trim. Slightly slower
    // than -ss before -i, but more reliable on multi-audio sources.
    '-i',
    opts.source,
    ...(filter.extraInputs ?? []),
    '-ss',
    startS.toFixed(3),
    '-t',
    durationS.toFixed(3),
    '-filter_complex',
    filter.filter,
    '-map',
    `[${filter.outputLabel}]`,
    '-map',
    `0:a:${audioIndex}?`,
    ...buildEncoderArgs(opts.preset.encode),
    '-movflags',
    '+faststart',
    output,
  ];

  try {
    await runCommand(ffmpegBin, {
      args,
      signal: opts.signal,
      timeoutMs: opts.timeoutMs ?? 30 * 60_000,
    });
  } finally {
    if (assPath) await rm(assPath, { force: true });
  }

  const thumbnailPath = `${output}.jpg`;
  await extractThumbnail({
    source: output,
    output: thumbnailPath,
    durationS,
    binaries: opts.binaries,
    signal: opts.signal,
  });

  const captionPath = `${output}.caption.txt`;
  await writeCaption(captionPath, opts.clip);

  return {
    videoPath: output,
    thumbnailPath,
    captionPath,
    durationS,
  };
}

interface FilterAssembly {
  filter: string;
  outputLabel: string;
  extraInputs: string[];
}

function buildClipFilter(input: {
  orientation: Orientation;
  dimensions: Dimensions;
  logo: LogoOverlayInput | null;
  assPath: string | null;
}): FilterAssembly {
  const geom = buildGeometryFilter(input.orientation, input.dimensions, 'vgeom');
  const overlay = buildLogoOverlay('vgeom', 'vlogo', input.logo);
  const stages: string[] = [geom.filter];
  if (overlay.filter) stages.push(overlay.filter);
  let lastLabel = overlay.outputLabel;

  if (input.assPath) {
    // libass burn-in. ffmpeg interprets backslashes, so escape them.
    const escapedPath = input.assPath
      .replace(/\\/g, '\\\\')
      .replace(/:/g, '\\:')
      .replace(/'/g, "'\\''");
    stages.push(`[${lastLabel}]subtitles=filename='${escapedPath}'[vfinal]`);
    lastLabel = 'vfinal';
  }

  return {
    filter: stages.join(';'),
    outputLabel: lastLabel,
    extraInputs: overlay.extraInputs,
  };
}

function buildEncoderArgs(encode: EncodeConfig): string[] {
  return [
    '-c:v',
    'libx264',
    '-preset',
    encode.preset,
    '-crf',
    String(encode.crf),
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(encode.fps),
    '-c:a',
    'aac',
    '-b:a',
    `${encode.audio_bitrate_kbps}k`,
    '-ac',
    '2',
    '-ar',
    '48000',
  ];
}

interface ThumbnailOptions {
  source: string;
  output: string;
  durationS: number;
  binaries?: FFmpegBinaries;
  signal?: AbortSignal;
}

async function extractThumbnail(opts: ThumbnailOptions): Promise<void> {
  // Sample 1/3 of the way in; usually past any black-frame intro.
  const sampleAt = Math.max(0.1, opts.durationS / 3);
  await runCommand(opts.binaries?.ffmpeg ?? 'ffmpeg', {
    args: [
      '-y',
      '-loglevel',
      'error',
      '-ss',
      sampleAt.toFixed(3),
      '-i',
      opts.source,
      '-frames:v',
      '1',
      '-q:v',
      '3',
      opts.output,
    ],
    signal: opts.signal,
    timeoutMs: 30_000,
  });
}

async function writeCaption(path: string, clip: ClipItem): Promise<void> {
  const lines = [
    clip.title.trim(),
    '',
    clip.publish_description.trim() || clip.rationale.trim(),
  ].filter((line, idx, all) => idx === 0 || line.length > 0 || all[idx - 1]?.length !== 0);
  await writeFile(path, `${lines.join('\n').trim()}\n`, 'utf-8');
}
