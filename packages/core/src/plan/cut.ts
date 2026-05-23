/**
 * Cut-plan generation.
 *
 * Asks the LLM to read the transcript (plus optional research
 * context) and return structured `longform_clips` and
 * `shortform_clips` arrays. Uses prompt-based JSON output so every
 * LLM provider works — no dependency on structured-output APIs.
 *
 * After the LLM returns we snap to Whisper segment boundaries.
 */

import { runWithFallback } from '@clipengine/llm-providers';
import type { ClipItem, CutPlan, LlmSettings, Preset, TranscriptDoc } from '@clipengine/schemas';
import { generateText } from 'ai';
import { z } from 'zod';
import { snapClipsToSegments } from './snap.js';
import { transcriptSnippet } from './snippets.js';

const RawClipSchema = z.object({
  start_s: z.number().min(0),
  end_s: z.number().min(0),
  title: z.string().min(1).max(120),
  rationale: z.string().min(1).max(500),
  publish_description: z.string().max(1000).default(''),
});

const RawCutPlanSchema = z.object({
  longform_clips: z.array(RawClipSchema).max(20),
  shortform_clips: z.array(RawClipSchema).max(20),
  notes: z.string().max(1000).nullable().default(null),
  editorial_summary: z.string().max(2000).nullable().default(null),
});
type RawCutPlan = z.infer<typeof RawCutPlanSchema>;

export interface RunCutOptions {
  transcript: TranscriptDoc;
  title: string;
  /** Pre-formatted research context, or empty string when search is off. */
  researchContext: string;
  llm: LlmSettings;
  /** Optional longform preset; controls duration bounds and inclusion. */
  longformPreset: Preset | null;
  /** Optional shortform preset; controls duration bounds and inclusion. */
  shortformPreset: Preset | null;
  signal?: AbortSignal;
}

export interface RunCutResult {
  plan: CutPlan;
  /** The profile that successfully produced the cut plan. */
  used: { provider: string; model: string };
}

/**
 * Run the cut-plan stage end-to-end. Throws if every LLM profile in
 * the chain fails.
 */
export async function runCut(opts: RunCutOptions): Promise<RunCutResult> {
  const { result: cutPlan, used } = await runWithFallback(opts.llm, async (model) => {
    const jsonSchema = buildSchemaDescription();

    const { text } = await generateText({
      model,
      system:
        'You are an expert video editor. Reply ONLY with valid JSON — no markdown fences, no commentary.',
      prompt: buildCutPlanPrompt(opts, jsonSchema),
      abortSignal: opts.signal,
    });

    return extractJson(text);
  });

  const longform = opts.longformPreset
    ? snapClipsToSegments(cutPlan.longform_clips as ClipItem[], {
        transcript: opts.transcript,
        minDurationS: opts.longformPreset.duration.min_s,
        maxDurationS: opts.longformPreset.duration.max_s,
      })
    : [];
  const shortform = opts.shortformPreset
    ? snapClipsToSegments(cutPlan.shortform_clips as ClipItem[], {
        transcript: opts.transcript,
        minDurationS: opts.shortformPreset.duration.min_s,
        maxDurationS: opts.shortformPreset.duration.max_s,
      })
    : [];

  const plan: CutPlan = {
    longform_clips: longform,
    shortform_clips: shortform,
    notes: cutPlan.notes,
    editorial_summary: cutPlan.editorial_summary,
  };

  return {
    plan,
    used: { provider: used.provider, model: used.model },
  };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildCutPlanPrompt(opts: RunCutOptions, schemaDesc: string): string {
  const snippet = transcriptSnippet(opts.transcript, 12_000);
  const longRange = opts.longformPreset
    ? `${opts.longformPreset.duration.min_s}-${opts.longformPreset.duration.max_s}s`
    : 'disabled';
  const shortRange = opts.shortformPreset
    ? `${opts.shortformPreset.duration.min_s}-${opts.shortformPreset.duration.max_s}s`
    : 'disabled';
  const research = opts.researchContext ? `\nResearch context:\n${opts.researchContext}\n` : '';

  return `Working title: "${opts.title}"
Source duration: ${opts.transcript.duration_s.toFixed(1)} seconds.

Produce two arrays of clip windows:

- longform_clips: ${longRange}. Self-contained segments suitable for
  YouTube. Empty when "disabled". Up to 6 entries.
- shortform_clips: ${shortRange}. Punchy, social-media-ready moments
  (TikTok / Reels / Shorts). Empty when "disabled". Up to 8 entries.

Rules:
- Use the transcript timestamps. Start and end MUST be valid
  seconds inside the source.
- Prefer cuts that begin at a natural sentence start and end at a
  natural sentence finish. We snap to segment boundaries afterward
  but the closer you are, the better.
- Each clip needs a "title" (clickable, 6-12 words), a "rationale"
  (one sentence on why it earns a clip), and a short
  "publish_description" suitable as a default video description /
  caption.
- "notes" is for any global notes for the editor (optional).
- "editorial_summary" is a short narrative paragraph about your
  picks (optional).
- Do NOT invent timestamps. If you are unsure, leave the array
  empty.

${research}
Transcript:
"""
${snippet}
"""

Reply with a single JSON object matching this schema:
${schemaDesc}`;
}

function buildSchemaDescription(): string {
  return `{
  "longform_clips": [
    {
      "start_s": number,    // start time in seconds
      "end_s": number,      // end time in seconds
      "title": string,      // 6-12 word clickable title
      "rationale": string,  // one sentence why this earns a clip
      "publish_description": string  // default caption (optional, max 1000 chars)
    }
  ],
  "shortform_clips": [ /* same structure */ ],
  "notes": string | null,   // optional global editor notes
  "editorial_summary": string | null  // optional narrative summary of picks
}`;
}

// ---------------------------------------------------------------------------
// JSON extraction
// ---------------------------------------------------------------------------

/**
 * Extract and validate a JSON object from an LLM text response.
 *
 * Handles common LLM output patterns:
 * - Plain JSON: {"key": "value"}
 * - Markdown-fenced JSON: ```json ... ```
 * - Loose fencing: ``` ... ```
 */
function extractJson(text: string): RawCutPlan {
  // Try the raw text first.
  let trimmed = text.trim();

  // Strip markdown code fences if present.
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/m);
  if (fenceMatch) {
    trimmed = fenceMatch[1]!.trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Last resort: find the first { and last }.
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error('cut: LLM response does not contain valid JSON');
    }
    const jsonCandidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      parsed = JSON.parse(jsonCandidate);
    } catch {
      throw new Error('cut: failed to parse LLM response as JSON');
    }
  }

  const result = RawCutPlanSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`cut: invalid cut plan from LLM: ${issues}`);
  }

  return result.data;
}
