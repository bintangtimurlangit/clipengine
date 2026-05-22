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

interface WhisperCppSegment {
  start: number;
  end: number;
  text: string;
}

interface WhisperCppOutput {
  /** Detected language code, when probable. */
  language?: string;
  /** Decoded segments with timestamps in seconds. */
  segments: WhisperCppSegment[];
  /** Total audio length in seconds, when reported. */
  duration?: number;
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

  const segments: TranscriptSegment[] = (parsed.segments ?? []).map((s) => ({
    start_s: Math.max(0, s.start),
    end_s: Math.max(s.start, s.end),
    text: s.text.trim(),
  }));
  const duration = parsed.duration ?? segments.at(-1)?.end_s ?? 0;

  return {
    source_video: basename(opts.sourceVideo),
    duration_s: duration,
    language: parsed.language ?? opts.language ?? null,
    segments,
    engine: `whisper-${opts.model}`,
  };
}
