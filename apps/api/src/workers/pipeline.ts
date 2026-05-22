/**
 * Per-run pipeline runner.
 *
 * Composes the engine stages — ingest, plan, render — for one
 * already-claimed run row. The worker pool calls runPipeline()
 * inside a per-run AbortController so cancel can SIGTERM ffmpeg /
 * yt-dlp / whisper.cpp midway.
 *
 * Source acquisition (upload finalize, yt-dlp VOD/live) lands in
 * Phase 8 and slots in at `acquireSource()` — for now we accept a
 * pre-resolved source path on the workspace.
 */

import { stat } from 'node:fs/promises';
import { runIngest, runPlan, runRender } from '@clipengine/core';
import {
  type DbClient,
  type LogosRepo,
  type PresetsRepo,
  type RunsRepo,
  SettingsRepo,
} from '@clipengine/db';
import {
  type LlmSettings,
  type Preset,
  type Run,
  SETTING_KEYS,
  type SearchSettings,
  type TranscriptionSettings,
} from '@clipengine/schemas';
import type { RunEventBus } from '../pubsub/run-events.js';
import { createProgressWriter } from './progress.js';

export interface PipelineDeps {
  db: DbClient;
  runs: RunsRepo;
  presets: PresetsRepo;
  logos: LogosRepo;
  bus: RunEventBus;
  /** Absolute path the worker pool resolves logo files relative to. */
  logosDir: string;
}

export interface RunPipelineOptions {
  /** The claimed run row. */
  run: Run;
  /**
   * Pre-resolved path to the source media. Phase 8 wires in
   * yt-dlp / upload finalize; for now the route handler that
   * creates the run drops the file here.
   */
  sourcePath: string;
  signal: AbortSignal;
}

export class RunCancelled extends Error {
  constructor() {
    super('run cancelled');
    this.name = 'RunCancelled';
  }
}

/**
 * Drive a single run through ingest -> plan -> render. Throws
 * {@link RunCancelled} when the cancel flag is observed; the worker
 * pool turns that into a `cancelled` status. Any other thrown error
 * lands as `failed`.
 */
export async function runPipeline(deps: PipelineDeps, opts: RunPipelineOptions): Promise<void> {
  const { run } = opts;
  const progress = createProgressWriter({
    runId: run.id,
    runs: deps.runs,
    bus: deps.bus,
  });

  // Resolve user-scoped settings once. The pipeline does not poll
  // them again mid-run, so changes take effect on the next run.
  const settings = new SettingsRepo(deps.db);
  const transcription = await settings.get(run.user_id, SETTING_KEYS.transcription);
  const llm = await settings.get(run.user_id, SETTING_KEYS.llm);
  const search = (await settings.get(run.user_id, SETTING_KEYS.search)) ?? {
    disabled: true,
  };
  if (!transcription) throw new Error('pipeline: transcription settings missing');
  if (!llm) throw new Error('pipeline: llm settings missing');

  const longformPreset = run.preset_longform_id
    ? await deps.presets.findById(run.user_id, run.preset_longform_id)
    : null;
  const shortformPreset = run.preset_shortform_id
    ? await deps.presets.findById(run.user_id, run.preset_shortform_id)
    : null;

  // ----- ingest ------------------------------------------------
  await checkCancel(opts.signal);
  await progress.setStatus('transcribing');
  await progress.log('info', 'ingest', 'extracting audio and transcribing');
  await stat(opts.sourcePath); // surface a clean error if the file is missing
  const ingest = await runIngest({
    source: opts.sourcePath,
    workspaceDir: run.workspace_path,
    transcription: transcription as TranscriptionSettings,
    signal: opts.signal,
  });
  await progress.log(
    'info',
    'ingest',
    `transcript ready (${ingest.transcript.segments.length} segments, ${ingest.durationSeconds.toFixed(1)}s)`,
  );
  await deps.runs.addArtifact({
    runId: run.id,
    kind: 'transcript',
    path: 'transcript.json',
    mime: 'application/json',
  });
  await deps.runs.addArtifact({
    runId: run.id,
    kind: 'audio',
    path: 'audio_16k_mono.wav',
    mime: 'audio/wav',
  });

  // ----- research (optional) + plan ---------------------------
  await checkCancel(opts.signal);
  if (!(search as SearchSettings).disabled) {
    await progress.setStatus('researching');
    await progress.log('info', 'research', 'gathering web context');
  }
  await progress.setStatus('planning');
  await progress.log('info', 'plan', 'asking LLM for cut plan');
  const planResult = await runPlan({
    transcript: ingest.transcript,
    title: run.title,
    workspaceDir: run.workspace_path,
    llm: llm as LlmSettings,
    search: search as SearchSettings,
    longformPreset,
    shortformPreset,
    signal: opts.signal,
  });
  await progress.log(
    'info',
    'plan',
    `plan ready (${planResult.plan.longform_clips.length} long, ${planResult.plan.shortform_clips.length} short, via ${planResult.used.provider}/${planResult.used.model})`,
  );
  await deps.runs.addArtifact({
    runId: run.id,
    kind: 'cut_plan',
    path: 'cut_plan.json',
    mime: 'application/json',
  });

  // ----- render ----------------------------------------------
  await checkCancel(opts.signal);
  await progress.setStatus('rendering');
  await progress.log('info', 'render', 'encoding clips');

  const logoPaths = await resolveLogoPaths({
    logos: deps.logos,
    userId: run.user_id,
    presets: [longformPreset, shortformPreset].filter(Boolean) as Preset[],
    logosDir: deps.logosDir,
  });

  const renderResult = await runRender({
    source: opts.sourcePath,
    workspaceDir: run.workspace_path,
    cutPlan: planResult.plan,
    transcript: ingest.transcript,
    longformPreset,
    shortformPreset,
    logoPaths,
    signal: opts.signal,
    onClipStart: ({ kind, index, total, clip }) => {
      progress.progress(
        'render',
        `${kind} ${index + 1}/${total}: ${clip.title}`,
        Math.round((index / Math.max(1, total)) * 100),
      );
    },
    onClipDone: ({ kind, index, total, clip }) => {
      void deps.runs.appendLog({
        runId: run.id,
        level: 'info',
        stage: 'render',
        message: `${kind} ${index + 1}/${total} done: ${clip.title}`,
      });
    },
  });

  for (const c of renderResult.longform) {
    await recordRenderedArtifacts(deps.runs, run, 'longform', c);
  }
  for (const c of renderResult.shortform) {
    await recordRenderedArtifacts(deps.runs, run, 'shortform', c);
  }

  await progress.complete();
  await progress.log(
    'info',
    'lifecycle',
    `done — ${renderResult.longform.length + renderResult.shortform.length} clip(s) rendered`,
  );
}

async function checkCancel(signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new RunCancelled();
}

async function recordRenderedArtifacts(
  runs: RunsRepo,
  run: Run,
  kind: 'longform' | 'shortform',
  rendered: { videoPath: string; thumbnailPath: string; captionPath: string },
): Promise<void> {
  const stripPrefix = (p: string) => p.replace(`${run.workspace_path}/`, '');
  await runs.addArtifact({
    runId: run.id,
    kind: kind === 'longform' ? 'longform_mp4' : 'shortform_mp4',
    path: stripPrefix(rendered.videoPath),
    mime: 'video/mp4',
  });
  await runs.addArtifact({
    runId: run.id,
    kind: kind === 'longform' ? 'longform_thumbnail' : 'shortform_thumbnail',
    path: stripPrefix(rendered.thumbnailPath),
    mime: 'image/jpeg',
  });
  await runs.addArtifact({
    runId: run.id,
    kind: kind === 'longform' ? 'longform_caption' : 'shortform_caption',
    path: stripPrefix(rendered.captionPath),
    mime: 'text/plain',
  });
}

async function resolveLogoPaths(args: {
  logos: LogosRepo;
  userId: string;
  presets: Preset[];
  logosDir: string;
}): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const preset of args.presets) {
    if (!preset.logo) continue;
    const row = await args.logos.findById(args.userId, preset.logo.logo_id);
    if (!row) continue;
    out[preset.logo.logo_id] =
      `${args.logosDir.replace(/\/+$/, '')}/${row.id}.${extFromFilename(row.filename)}`;
  }
  return out;
}

function extFromFilename(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1) : 'png';
}
