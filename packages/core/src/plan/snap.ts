/**
 * Snap raw LLM cut times to Whisper segment boundaries so clips
 * never start or end mid-utterance.
 *
 * The planner returns floating-point seconds it picked from looking
 * at the transcript. They're usually close to a segment boundary
 * but rarely exact. We round each `start_s` down to the nearest
 * segment start at or before the chosen time, and each `end_s` up
 * to the nearest segment end at or after.
 *
 * After snapping, items shorter than `minDurationS` are dropped and
 * those longer than `maxDurationS` are trimmed by extending forward
 * (preferring to keep the start) or, if the source ends first, by
 * extending backward.
 */

import type { ClipItem, TranscriptDoc } from '@clipengine/schemas';

export interface SnapOptions {
  transcript: TranscriptDoc;
  minDurationS: number;
  maxDurationS: number;
}

/** Snap and clamp a list of clip items. Returns a filtered copy. */
export function snapClipsToSegments(items: ClipItem[], options: SnapOptions): ClipItem[] {
  const { transcript } = options;
  if (transcript.segments.length === 0) return items;

  const out: ClipItem[] = [];
  for (const item of items) {
    const snapped = snapOne(item, options);
    if (snapped !== null) out.push(snapped);
  }
  return out;
}

function snapOne(item: ClipItem, options: SnapOptions): ClipItem | null {
  const { transcript, minDurationS, maxDurationS } = options;
  const segments = transcript.segments;
  const total = transcript.duration_s;

  // Round start down to the nearest segment start.
  let start = item.start_s;
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i];
    if (!s) continue;
    if (s.start_s <= item.start_s) {
      start = s.start_s;
      break;
    }
  }

  // Round end up to the nearest segment end.
  let end = item.end_s;
  for (const s of segments) {
    if (s.end_s >= item.end_s) {
      end = s.end_s;
      break;
    }
  }

  if (end <= start) return null;
  if (end > total) end = total;

  // Drop fragments shorter than the minimum.
  if (end - start < minDurationS) return null;

  // Trim long fragments by walking back to the closest segment end
  // that fits inside maxDurationS.
  if (end - start > maxDurationS) {
    const cap = start + maxDurationS;
    let trimmed = end;
    for (let i = segments.length - 1; i >= 0; i--) {
      const s = segments[i];
      if (!s) continue;
      if (s.end_s <= cap && s.end_s > start) {
        trimmed = s.end_s;
        break;
      }
    }
    end = trimmed;
  }

  if (end - start < minDurationS) return null;

  return {
    start_s: start,
    end_s: end,
    title: item.title,
    rationale: item.rationale,
    publish_description: item.publish_description,
  };
}
