# `core/plan`

Reads the transcript and produces `cut_plan.json`.

## Public entry

```ts
runPlan({
  transcript,                        // TranscriptDoc from ingest
  title,                             // human title shown to the LLM
  workspaceDir,                      // where to write cut_plan.json
  llm,                               // LlmSettings (primary + fallbacks)
  search,                            // SearchSettings
  longformPreset,                    // Preset | null
  shortformPreset,                   // Preset | null
  signal?, fetchImpl?,
}) -> { plan, planPath, research, used }
```

Three steps:

1. Optional **research** through `runResearch()` — a Tavily / Brave
   query pair derived from the transcript.
2. **Cut** through `runCut()` — the LLM returns a structured
   `RawCutPlan`.
3. Snap — every clip is rounded to the nearest Whisper segment
   boundary and clamped to the preset's `min_s` / `max_s`.

## Snap

`snapClipsToSegments(items, { transcript, minDurationS, maxDurationS })`.

For each item:

- `start_s` rounds **down** to the nearest segment start at or
  before the chosen time.
- `end_s` rounds **up** to the nearest segment end at or after.
- Items shorter than `min_s` after snapping are dropped.
- Items longer than `max_s` are trimmed by walking back to the
  closest segment end inside the cap.

Pure function, no I/O. Seven unit tests cover the boundary math,
empty-segment edge case, and end clamp.

## Research

`runResearch()` calls the LLM once with `generateObject()` to
produce `{ identity_query, highlights_query }`. Both queries go
through `runSearchChain()` in parallel; results are formatted into a
compact context block the cut prompt embeds.

If `search.disabled` is true, research returns immediately with
empty queries and an empty context. If both providers fail, the
context is empty and the cut prompt is asked to work from transcript
only.

The activity payload (`identity_attempts`, `highlights_attempts`,
`identity_response`, `highlights_response`) is recorded so the run
log shows what happened.

## Cut

`runCut()` calls the LLM with a strict `RawCutPlanSchema` (Zod):

- `longform_clips` — up to 6 entries.
- `shortform_clips` — up to 8 entries.
- Each clip: `start_s`, `end_s`, `title`, `rationale`,
  `publish_description`.
- Optional global `notes` and `editorial_summary`.

The prompt embeds the transcript snippet, the duration bounds for
each kind, and the research context. Generated through
`runWithFallback()` from `@clipengine/llm-providers` so failures cascade
across the user's primary + fallback chain.

After the LLM returns, the snap step trims outputs against the
preset bounds and the `cut_plan.json` is written to disk.

## Snippets

`transcriptSnippet(doc, maxChars)` formats segments as
`[mm:ss.cc -> mm:ss.cc] text`. When the transcript exceeds the cap,
samples evenly from the start, middle, and end so the LLM still sees
the whole arc instead of just the opening.

## Files

- `snap.ts` — `snapClipsToSegments`.
- `snippets.ts` — `transcriptSnippet`, `formatSegment`.
- `research.ts` — `runResearch`.
- `cut.ts` — `runCut`, `RawCutPlanSchema`, the cut-plan prompt.
- `index.ts` — `runPlan` and re-exports.

## Tests

`packages/core/tests/plan.test.ts` covers snap behavior end-to-end.
LLM and search calls are not covered by unit tests because they
depend on external services; they're exercised at runtime instead.
