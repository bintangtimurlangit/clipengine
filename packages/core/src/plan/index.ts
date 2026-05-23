/**
 * `@clipengine/core/plan` — composed entry point for the planning
 * stage. The worker pool calls runPlan() once per run.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  CutPlan,
  LlmSettings,
  Preset,
  SearchSettings,
  TranscriptDoc,
} from '@clipengine/schemas';
import { runCut } from './cut.js';
import { type ResearchActivity, runResearch } from './research.js';

export interface RunPlanOptions {
  transcript: TranscriptDoc;
  title: string;
  workspaceDir: string;
  llm: LlmSettings;
  search: SearchSettings;
  longformPreset: Preset | null;
  shortformPreset: Preset | null;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface RunPlanResult {
  plan: CutPlan;
  planPath: string;
  /** Telemetry the worker writes to the activity stream. */
  research: ResearchActivity;
  used: { provider: string; model: string };
}

/**
 * Run the planning stage end-to-end:
 *   1. Optional research (queries + web search).
 *   2. LLM cut-plan generation with structured output.
 *   3. Snap to Whisper segment boundaries.
 *   4. Write `cut_plan.json` next to the transcript.
 */
export async function runPlan(opts: RunPlanOptions): Promise<RunPlanResult> {
  if (!opts.longformPreset && !opts.shortformPreset) {
    throw new Error('plan: at least one preset (longform or shortform) is required');
  }

  const research = await runResearch({
    transcript: opts.transcript,
    title: opts.title,
    llm: opts.llm,
    search: opts.search,
    signal: opts.signal,
    fetchImpl: opts.fetchImpl,
  });

  const cut = await runCut({
    transcript: opts.transcript,
    title: opts.title,
    researchContext: research.context,
    llm: opts.llm,
    longformPreset: opts.longformPreset,
    shortformPreset: opts.shortformPreset,
    signal: opts.signal,
  });

  const workspace = resolve(opts.workspaceDir);
  await mkdir(workspace, { recursive: true });
  const planPath = join(workspace, 'cut_plan.json');
  await writeFile(planPath, JSON.stringify(cut.plan, null, 2));

  return {
    plan: cut.plan,
    planPath,
    research: research.activity,
    used: cut.used,
  };
}

export { runCut } from './cut.js';
export { type ResearchActivity, type ResearchResult, runResearch } from './research.js';
export { type SnapOptions, snapClipsToSegments } from './snap.js';
export { transcriptSnippet } from './snippets.js';
