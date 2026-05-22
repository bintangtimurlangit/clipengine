/**
 * Run schemas — the lifecycle and persistence shape of a single
 * clipping job. A run owns a workspace directory and produces
 * artifacts (transcript, plan, rendered MP4s, thumbnails, captions).
 */

import { z } from 'zod';
import { SourceSchema } from './source.js';

/**
 * Linear state machine. A run advances through these states once and
 * only ends in `completed`, `failed`, or `cancelled`.
 *
 *   queued -> acquiring -> transcribing -> researching? -> planning ->
 *   rendering -> completed
 */
export const RunStatusSchema = z.enum([
  'queued',
  'acquiring',
  'transcribing',
  'researching',
  'planning',
  'rendering',
  'completed',
  'failed',
  'cancelled',
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const TERMINAL_RUN_STATUSES = ['completed', 'failed', 'cancelled'] as const;
export const ACTIVE_RUN_STATUSES = [
  'queued',
  'acquiring',
  'transcribing',
  'researching',
  'planning',
  'rendering',
] as const;

/** Stable error codes surfaced to the UI; matches docs/reference/error-codes.md. */
export const RunErrorCodeSchema = z.enum([
  'source_unreachable',
  'source_too_large',
  'transcription_failed',
  'llm_unconfigured',
  'llm_failed',
  'search_failed',
  'render_failed',
  'cancelled',
  'internal',
]);
export type RunErrorCode = z.infer<typeof RunErrorCodeSchema>;

export const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
export type LogLevel = z.infer<typeof LogLevelSchema>;

/** Stages a log line can come from; useful for filtering in the UI. */
export const RunStageSchema = z.enum([
  'queue',
  'acquire',
  'ingest',
  'research',
  'plan',
  'render',
  'lifecycle',
]);
export type RunStage = z.infer<typeof RunStageSchema>;

export const RunLogEntrySchema = z.object({
  ts: z.string().datetime({ offset: true }),
  level: LogLevelSchema,
  stage: RunStageSchema,
  message: z.string(),
});
export type RunLogEntry = z.infer<typeof RunLogEntrySchema>;

export const RunArtifactKindSchema = z.enum([
  'source',
  'audio',
  'transcript',
  'cut_plan',
  'render_activity',
  'longform_mp4',
  'longform_thumbnail',
  'longform_caption',
  'shortform_mp4',
  'shortform_thumbnail',
  'shortform_caption',
]);
export type RunArtifactKind = z.infer<typeof RunArtifactKindSchema>;

export const RunArtifactSchema = z.object({
  id: z.string().uuid(),
  run_id: z.string().uuid(),
  kind: RunArtifactKindSchema,
  /** Path relative to the run's workspace directory. */
  path: z.string(),
  mime: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  meta: z.record(z.unknown()).optional(),
});
export type RunArtifact = z.infer<typeof RunArtifactSchema>;

/** A run row as exposed over the API. */
export const RunSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  status: RunStatusSchema,
  source: SourceSchema,
  title: z.string().min(1).max(200),
  preset_longform_id: z.string().uuid().nullable(),
  preset_shortform_id: z.string().uuid().nullable(),
  workspace_path: z.string(),
  cancel_requested: z.boolean(),
  error_code: RunErrorCodeSchema.nullable(),
  error_message: z.string().nullable(),
  created_at: z.string().datetime({ offset: true }),
  started_at: z.string().datetime({ offset: true }).nullable(),
  finished_at: z.string().datetime({ offset: true }).nullable(),
});
export type Run = z.infer<typeof RunSchema>;

/** Body of POST /api/runs. */
export const CreateRunInputSchema = z
  .object({
    title: z.string().min(1).max(200),
    source: SourceSchema,
    preset_longform_id: z.string().uuid().nullable(),
    preset_shortform_id: z.string().uuid().nullable(),
  })
  .refine((v) => v.preset_longform_id !== null || v.preset_shortform_id !== null, {
    message: 'at least one preset (longform or shortform) is required',
    path: ['preset_longform_id'],
  });
export type CreateRunInput = z.infer<typeof CreateRunInputSchema>;

/* ----- Pipeline output shapes (written to disk as JSON files) ------ */

/** A single transcript segment; produced by ingest, consumed by plan/render. */
export const TranscriptSegmentSchema = z.object({
  start_s: z.number().nonnegative(),
  end_s: z.number().nonnegative(),
  text: z.string(),
});
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;

export const TranscriptDocSchema = z.object({
  source_video: z.string(),
  duration_s: z.number().nonnegative(),
  language: z.string().nullable(),
  segments: z.array(TranscriptSegmentSchema),
  /** Identifier of the engine that produced the transcript (e.g. `whisper-base`). */
  engine: z.string(),
});
export type TranscriptDoc = z.infer<typeof TranscriptDocSchema>;

/** One clip window in a `cut_plan.json`. */
export const ClipItemSchema = z
  .object({
    start_s: z.number().nonnegative(),
    end_s: z.number().nonnegative(),
    title: z.string().default(''),
    rationale: z.string().default(''),
    /** Short public-facing copy used as a default caption. */
    publish_description: z.string().default(''),
  })
  .refine((c) => c.end_s > c.start_s, {
    message: 'end_s must be > start_s',
    path: ['end_s'],
  });
export type ClipItem = z.infer<typeof ClipItemSchema>;

/** Full `cut_plan.json` output of the planning stage. */
export const CutPlanSchema = z.object({
  longform_clips: z.array(ClipItemSchema),
  shortform_clips: z.array(ClipItemSchema),
  notes: z.string().nullable().default(null),
  editorial_summary: z.string().nullable().default(null),
});
export type CutPlan = z.infer<typeof CutPlanSchema>;
