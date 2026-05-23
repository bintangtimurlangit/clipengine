/**
 * Local transcription backend (whisper.cpp via `nodejs-whisper`).
 *
 * The library wraps the whisper.cpp binary and a downloaded GGML
 * model. We hand it our extracted 16 kHz mono WAV and parse its
 * verbose JSON output into a {@link TranscriptDoc}.
 */

import { readFile, rm } from 'node:fs/promises';
import { basename } from 'node:path';
import type { TranscriptDoc, TranscriptSegment, WhisperModel } from '@clipengine/schemas';
import { nodewhisper } from 'nodejs-whisper';

export interface TranscribeLocalOptions {
  /** Path to the WAV produced by `extractAudioWav16kMono`. */
  audioPath: string;
  /** Original video path; recorded in the transcript for traceability. */
  sourceVideo: string;
  /** Whisper.cpp model name. ClipEngine ships `base` as the default. */
  model: WhisperModel;
  /** ISO-639-1 language code; `null` lets the model auto-detect. */
  language: string | null;
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Legacy format (whisper.cpp < v1.7)
// ---------------------------------------------------------------------------
interface LegacySegment {
  start: number;
  end: number;
  text: string;
}

interface LegacyOutput {
  language?: string;
  segments: LegacySegment[];
  duration?: number;
}

// ---------------------------------------------------------------------------
// Current format (whisper.cpp >= v1.7)
// ---------------------------------------------------------------------------
interface CurrentTimestamp {
  from: string;
  to: string;
}

interface CurrentOffsets {
  from: number;
  to: number;
}

interface CurrentTranscriptionItem {
  timestamps: CurrentTimestamp;
  offsets: CurrentOffsets;
  text: string;
}

interface CurrentResult {
  language: string;
}

interface CurrentOutput {
  result?: CurrentResult;
  transcription?: CurrentTranscriptionItem[];
}

type WhisperCppOutput = LegacyOutput & CurrentOutput;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a SRT-style timecode "HH:MM:SS,mmm" into seconds. */
function timecodeToSeconds(tc: string): number {
  // format: "HH:MM:SS,mmm"
  const match = tc.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) return 0;
  const h = Number.parseInt(match[1]!, 10);
  const m = Number.parseInt(match[2]!, 10);
  const s = Number.parseInt(match[3]!, 10);
  const ms = Number.parseInt(match[4]!, 10);
  return h * 3600 + m * 60 + s + ms / 1000;
}

/** Run whisper.cpp on the given WAV and return a normalized transcript. */
export async function transcribeLocal(opts: TranscribeLocalOptions): Promise<TranscriptDoc> {
  if (opts.signal?.aborted) {
    throw new Error('transcribe: aborted before start');
  }

  // nodejs-whisper writes its JSON output next to the input WAV.
  const jsonPath = `${opts.audioPath}.json`;

  await nodewhisper(opts.audioPath, {
    modelName: opts.model,
    autoDownloadModelName: opts.model,
    removeWavFileAfterTranscription: false,
    withCuda: false,
    logger: console,
    whisperOptions: {
      outputInJson: true,
      outputInText: false,
      outputInSrt: false,
      outputInVtt: false,
      outputInCsv: false,
      outputInWords: false,
      translateToEnglish: false,
      wordTimestamps: false,
      timestamps_length: 0,
      splitOnWord: false,
      ...(opts.language ? { language: opts.language } : {}),
    },
  });

  const raw = await readFile(jsonPath, 'utf-8');
  await rm(jsonPath, { force: true });
  const parsed = JSON.parse(raw) as WhisperCppOutput;

  // Detect format: prefer the new "transcription" array with offsets.
  let rawSegments: { start_s: number; end_s: number; text: string }[] = [];

  if (parsed.transcription && parsed.transcription.length > 0) {
    // New format: offsets are in milliseconds, timestamps in timecode.
    rawSegments = parsed.transcription
      .filter((item) => item.text.trim() && item.text.trim() !== '[BLANK_AUDIO]')
      .map((item) => ({
        start_s: item.offsets ? item.offsets.from / 1000 : timecodeToSeconds(item.timestamps.from),
        end_s: item.offsets ? item.offsets.to / 1000 : timecodeToSeconds(item.timestamps.to),
        text: item.text.trim(),
      }));
  } else if (parsed.segments && parsed.segments.length > 0) {
    // Legacy format: start/end are already in seconds.
    rawSegments = (parsed.segments as LegacySegment[]).map((s) => ({
      start_s: Math.max(0, s.start),
      end_s: Math.max(s.start, s.end),
      text: s.text.trim(),
    }));
  }

  const segments: TranscriptSegment[] = rawSegments.map((s) => ({
    start_s: s.start_s,
    end_s: s.end_s,
    text: s.text,
  }));
  const duration = segments.at(-1)?.end_s ?? 0;
  const language =
    parsed.result?.language ?? parsed.language ?? opts.language ?? null;

  return {
    source_video: basename(opts.sourceVideo),
    duration_s: duration,
    language,
    segments,
    engine: `whisper-${opts.model}`,
  };
}
