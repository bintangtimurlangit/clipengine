/**
 * ASS (Advanced SubStation Alpha) subtitle file generator.
 *
 * libass renders these natively when piped through ffmpeg's
 * `subtitles` filter. We build the file in memory from the run's
 * transcript and the preset's subtitle config; the rendered
 * subtitles burn into the final MP4.
 *
 * This module is pure — no I/O — so it's trivial to unit-test.
 */

import type {
  Anchor,
  Dimensions,
  SubtitleConfig,
  TranscriptDoc,
  TranscriptSegment,
} from '@clipengine/schemas';

export interface BuildSubtitlesOptions {
  /** Transcript whose segments are flowed into ASS dialogue lines. */
  transcript: TranscriptDoc;
  /** Per-preset subtitle style. */
  config: SubtitleConfig;
  /** Output frame dimensions; ASS PlayRes mirrors them. */
  dimensions: Dimensions;
  /** Time offset in seconds to subtract from each segment timestamp. */
  startOffsetS: number;
  /** Hard cap; segments overlapping this are clipped to it. */
  durationS: number;
}

/**
 * Render the transcript as an ASS subtitle string. Each segment that
 * overlaps `[startOffsetS, startOffsetS + durationS]` becomes a
 * dialogue cue with timestamps re-based to start at zero.
 */
export function buildAssSubtitles(opts: BuildSubtitlesOptions): string {
  const styleLine = buildStyleLine(opts.config, opts.dimensions);
  const dialogueLines: string[] = [];
  for (const seg of opts.transcript.segments) {
    const cue = clipSegment(seg, opts.startOffsetS, opts.durationS);
    if (!cue) continue;
    const wrapped = wrapText(cue.text, opts.config.max_lines);
    if (!wrapped) continue;
    dialogueLines.push(formatDialogue(cue.start, cue.end, wrapped));
  }
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${opts.dimensions.width}`,
    `PlayResY: ${opts.dimensions.height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    styleLine,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...dialogueLines,
  ].join('\n');
}

interface ClippedCue {
  start: number;
  end: number;
  text: string;
}

function clipSegment(
  seg: TranscriptSegment,
  startOffset: number,
  durationS: number,
): ClippedCue | null {
  const end = Math.min(seg.end_s, startOffset + durationS);
  const start = Math.max(seg.start_s, startOffset);
  if (end <= start) return null;
  const text = seg.text.trim();
  if (!text) return null;
  return {
    start: start - startOffset,
    end: end - startOffset,
    text,
  };
}

function wrapText(text: string, maxLines: number): string {
  // Soft-wrap at sentence-y boundaries. ASS uses \N for line breaks.
  const words = text.split(/\s+/);
  if (words.length === 0) return '';
  const targetPerLine = Math.max(4, Math.ceil(words.length / maxLines));
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += targetPerLine) {
    lines.push(words.slice(i, i + targetPerLine).join(' '));
  }
  // Cap at maxLines; trailing words append to the last line.
  if (lines.length > maxLines) {
    const tail = lines.slice(maxLines - 1).join(' ');
    lines.length = maxLines - 1;
    lines.push(tail);
  }
  return lines.map(escapeAssText).join('\\N');
}

function escapeAssText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\r?\n/g, '\\N');
}

function buildStyleLine(config: SubtitleConfig, dims: Dimensions): string {
  const primary = hexToAssColor(config.primary_color);
  const outline = hexToAssColor(config.outline_color);
  const back = '&H80000000'; // semi-transparent black, unused (BorderStyle=1)
  const alignment = anchorToAssAlignment(config.alignment);
  const marginV = clampMargin(config.margin_v_px + config.safe_area_px, dims.height);
  return [
    'Style: Default',
    config.font_family,
    String(config.font_size_px),
    primary,
    outline,
    back,
    '0', // Bold
    '0', // Italic
    '0', // Underline
    '0', // StrikeOut
    '100', // ScaleX
    '100', // ScaleY
    '0', // Spacing
    '0', // Angle
    '1', // BorderStyle (1 = outline + drop shadow)
    String(config.outline_width),
    '0', // Shadow
    String(alignment),
    '40', // MarginL
    '40', // MarginR
    String(marginV),
    '1', // Encoding (default)
  ].join(',');
}

function clampMargin(value: number, height: number): number {
  return Math.max(0, Math.min(value, Math.floor(height / 2)));
}

/**
 * Map an {@link Anchor} to an ASS numpad alignment. ASS uses 1-9
 * with 1=bottom-left, 5=center, 9=top-right.
 */
function anchorToAssAlignment(anchor: Anchor): number {
  const map: Record<Anchor, number> = {
    bottom_left: 1,
    bottom_center: 2,
    bottom_right: 3,
    middle_left: 4,
    middle_center: 5,
    middle_right: 6,
    top_left: 7,
    top_center: 8,
    top_right: 9,
  };
  return map[anchor];
}

/**
 * `#RRGGBB` → ASS `&HBBGGRR&`. ASS swaps red/blue and prefixes with
 * `&H`. We don't carry alpha because the schema only allows
 * `#RRGGBB`.
 */
export function hexToAssColor(hex: string): string {
  const cleaned = hex.replace('#', '');
  const r = cleaned.slice(0, 2);
  const g = cleaned.slice(2, 4);
  const b = cleaned.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

function formatDialogue(start: number, end: number, text: string): string {
  return `Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Default,,0,0,0,,${text}`;
}

/** ASS time format: H:MM:SS.cc (centiseconds). */
export function formatAssTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const cs = Math.round((total - Math.floor(total)) * 100);
  const safeCs = cs === 100 ? 99 : cs;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(safeCs).padStart(2, '0')}`;
}
