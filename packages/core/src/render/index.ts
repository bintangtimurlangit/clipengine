/**
 * `@clipengine/core/render` — orchestrates ffmpeg passes for one
 * cut plan against one or two presets (longform 16:9, shortform
 * 9:16). Pure logic; the worker drives this and writes results to
 * the run's workspace.
 */

import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ClipItem, CutPlan, Preset, TranscriptDoc } from '@clipengine/schemas';
import { type FFmpegBinaries, encodeClip } from './ffmpeg.js';

export interface RunRenderOptions {
  /** Source video path. */
  source: string;
  /** Workspace dir. Outputs go under `<workspace>/rendered/...`. */
  workspaceDir: string;
  cutPlan: CutPlan;
  transcript: TranscriptDoc;
  longformPreset: Preset | null;
  shortformPreset: Preset | null;
  /**
   * Resolved on-disk path to each preset's logo PNG, keyed by
   * `logo_id`. Renders without a logo when the preset has
   * `logo: null` or the id is missing.
   */
  logoPaths: Record<string, string>;
  /** Audio stream index to mux. Defaults to 0. */
  audioStreamIndex?: number;
  binaries?: FFmpegBinaries;
  signal?: AbortSignal;
  /** Optional callback fired before each clip starts encoding. */
  onClipStart?: (info: ClipProgress) => void;
  /** Optional callback fired after each clip finishes. */
  onClipDone?: (info: ClipProgress & { videoPath: string }) => void;
}

export interface ClipProgress {
  kind: 'longform' | 'shortform';
  index: number;
  total: number;
  clip: ClipItem;
}

export interface RunRenderResult {
  longform: RenderedClip[];
  shortform: RenderedClip[];
}

export interface RenderedClip {
  index: number;
  clip: ClipItem;
  videoPath: string;
  thumbnailPath: string;
  captionPath: string;
  durationS: number;
}

/**
 * Render every clip in the plan. For each preset:
 *   - skip if the preset is null or the clip array is empty;
 *   - render to `rendered/<longform|shortform>/<NN>_<slug>.mp4`.
 */
export async function runRender(opts: RunRenderOptions): Promise<RunRenderResult> {
  const workspace = resolve(opts.workspaceDir);
  const longDir = join(workspace, 'rendered', 'longform');
  const shortDir = join(workspace, 'rendered', 'shortform');
  await mkdir(longDir, { recursive: true });
  await mkdir(shortDir, { recursive: true });

  const longform = opts.longformPreset
    ? await renderClipSet({
        ...opts,
        kind: 'longform',
        outDir: longDir,
        clips: opts.cutPlan.longform_clips,
        preset: opts.longformPreset,
      })
    : [];

  const shortform = opts.shortformPreset
    ? await renderClipSet({
        ...opts,
        kind: 'shortform',
        outDir: shortDir,
        clips: opts.cutPlan.shortform_clips,
        preset: opts.shortformPreset,
      })
    : [];

  return { longform, shortform };
}

interface RenderClipSetOptions extends RunRenderOptions {
  kind: 'longform' | 'shortform';
  outDir: string;
  clips: ClipItem[];
  preset: Preset;
}

async function renderClipSet(opts: RenderClipSetOptions): Promise<RenderedClip[]> {
  const out: RenderedClip[] = [];
  const total = opts.clips.length;
  for (let i = 0; i < total; i++) {
    const clip = opts.clips[i];
    if (!clip) continue;
    const filename = `${String(i + 1).padStart(2, '0')}_${slugify(clip.title)}.mp4`;
    const target = join(opts.outDir, filename);

    opts.onClipStart?.({ kind: opts.kind, index: i, total, clip });

    const logoPath = resolveLogoPath(opts.preset, opts.logoPaths);
    const result = await encodeClip({
      source: opts.source,
      output: target,
      clip,
      preset: opts.preset,
      transcript: opts.transcript,
      logoPath,
      audioStreamIndex: opts.audioStreamIndex,
      binaries: opts.binaries,
      signal: opts.signal,
    });
    const rendered: RenderedClip = {
      index: i,
      clip,
      videoPath: result.videoPath,
      thumbnailPath: result.thumbnailPath,
      captionPath: result.captionPath,
      durationS: result.durationS,
    };
    out.push(rendered);
    opts.onClipDone?.({
      kind: opts.kind,
      index: i,
      total,
      clip,
      videoPath: result.videoPath,
    });
  }
  return out;
}

function resolveLogoPath(preset: Preset, logoPaths: Record<string, string>): string | null {
  if (!preset.logo) return null;
  return logoPaths[preset.logo.logo_id] ?? null;
}

/** Lowercase, hyphen-separated, ASCII-only slug, capped at ~40 chars. */
export function slugify(value: string): string {
  const base = value
    .normalize('NFKD')
    // biome-ignore lint/suspicious/noMisleadingCharacterClass: combining-mark range strips NFKD diacritics
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return (base || 'clip').slice(0, 40);
}

export { encodeClip } from './ffmpeg.js';
export { buildAssSubtitles, formatAssTime, hexToAssColor } from './subtitles.js';
export { buildLogoOverlay } from './overlay.js';
export { buildGeometryFilter } from './geometry.js';
