/**
 * Helpers for building compact prompt fragments out of a transcript.
 */

import type { TranscriptDoc } from '@clipengine/schemas';

/**
 * Return up to `maxChars` of transcript text with timestamps,
 * sampling evenly across the source so the LLM sees the start,
 * the middle, and the end even when the transcript is huge.
 */
export function transcriptSnippet(doc: TranscriptDoc, maxChars: number): string {
  const segments = doc.segments;
  if (segments.length === 0) return '';

  const formatted = segments.map(formatSegment);
  const joined = formatted.join('\n');
  if (joined.length <= maxChars) return joined;

  // Sample evenly: keep ~1/3 from start, 1/3 from middle, 1/3 from end.
  const target = Math.floor(maxChars / 3);
  let head = '';
  for (const line of formatted) {
    if (head.length + line.length + 1 > target) break;
    head += `${line}\n`;
  }

  const middleStart = Math.floor(formatted.length / 2);
  let middle = '';
  for (let i = middleStart; i < formatted.length; i++) {
    const line = formatted[i];
    if (!line) continue;
    if (middle.length + line.length + 1 > target) break;
    middle += `${line}\n`;
  }

  let tail = '';
  for (let i = formatted.length - 1; i >= 0; i--) {
    const line = formatted[i];
    if (!line) continue;
    if (tail.length + line.length + 1 > target) break;
    tail = `${line}\n${tail}`;
  }

  return `${head.trim()}\n[...]\n${middle.trim()}\n[...]\n${tail.trim()}`;
}

/** "[01:23.40 -> 01:25.10] line of dialogue" */
export function formatSegment(s: { start_s: number; end_s: number; text: string }): string {
  return `[${formatTime(s.start_s)} -> ${formatTime(s.end_s)}] ${s.text}`;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  const m = String(minutes).padStart(2, '0');
  const s = remainder.toFixed(2).padStart(5, '0');
  return `${m}:${s}`;
}
