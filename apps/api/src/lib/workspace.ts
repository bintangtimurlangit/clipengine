/**
 * Workspace path helpers.
 *
 * Every run owns a directory under `<CLIPENGINE_WORKSPACE>/runs/<id>`.
 * The worker, the API, and the renderer all derive paths from these
 * helpers so the layout stays consistent.
 */

import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface WorkspacePaths {
  /** Run-specific directory. */
  runDir: string;
  /** The acquired source video; extension depends on the source. */
  sourceFile: (ext: string) => string;
  /** 16 kHz mono WAV used for transcription. */
  audioWav: string;
  /** transcript.json written by ingest. */
  transcript: string;
  /** cut_plan.json written by plan. */
  cutPlan: string;
  /** Top-level rendered/ folder; longform/shortform live underneath. */
  renderedDir: string;
}

export function workspacePathsFor(runsRoot: string, runId: string): WorkspacePaths {
  const runDir = resolve(join(runsRoot, 'runs', runId));
  return {
    runDir,
    sourceFile: (ext: string) => join(runDir, `source.${ext.replace(/^\./, '')}`),
    audioWav: join(runDir, 'audio_16k_mono.wav'),
    transcript: join(runDir, 'transcript.json'),
    cutPlan: join(runDir, 'cut_plan.json'),
    renderedDir: join(runDir, 'rendered'),
  };
}

/** Create the run directory if it doesn't exist. Returns the same paths. */
export async function ensureWorkspace(runsRoot: string, runId: string): Promise<WorkspacePaths> {
  const paths = workspacePathsFor(runsRoot, runId);
  await mkdir(paths.runDir, { recursive: true });
  return paths;
}
