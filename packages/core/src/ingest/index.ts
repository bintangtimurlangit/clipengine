/**
 * Public surface of `@clipengine/core/ingest`.
 *
 * Composed entry point that produces a {@link TranscriptDoc} (and
 * its on-disk JSON file) from a single source video. The worker
 * pool drives this end-to-end; tests can also call the smaller
 * helpers directly.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { TranscriptDoc, TranscriptionSettings } from '@clipengine/schemas';
import { type FFmpegBinaries, extractAudioWav16kMono, probeDurationSeconds } from './audio.js';
import { transcribe } from './transcribe.js';

export interface RunIngestOptions {
  /** Path to the source video file. */
  source: string;
  /** Workspace directory; the transcript JSON and WAV go here. */
  workspaceDir: string;
  /** Which audio stream (`-map 0:a:N`) to use. Defaults to 0. */
  audioStreamIndex?: number;
  /** Validated transcription settings (local or remote). */
  transcription: TranscriptionSettings;
  binaries?: FFmpegBinaries;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface RunIngestResult {
  audioPath: string;
  transcriptPath: string;
  transcript: TranscriptDoc;
  durationSeconds: number;
}

/**
 * End-to-end ingest:
 *   1. Probe the source for total duration.
 *   2. Extract a 16 kHz mono WAV.
 *   3. Transcribe with the configured backend.
 *   4. Write `transcript.json` to the workspace.
 */
export async function runIngest(opts: RunIngestOptions): Promise<RunIngestResult> {
  const workspace = resolve(opts.workspaceDir);
  await mkdir(workspace, { recursive: true });

  const audioPath = join(workspace, 'audio_16k_mono.wav');
  const transcriptPath = join(workspace, 'transcript.json');

  const durationSeconds = await probeDurationSeconds({
    source: opts.source,
    binaries: opts.binaries,
    signal: opts.signal,
  });

  await extractAudioWav16kMono({
    source: opts.source,
    output: audioPath,
    audioStreamIndex: opts.audioStreamIndex,
    binaries: opts.binaries,
    signal: opts.signal,
  });

  const transcript = await transcribe({
    audioPath,
    sourceVideo: opts.source,
    settings: opts.transcription,
    signal: opts.signal,
    fetchImpl: opts.fetchImpl,
  });

  await mkdir(dirname(transcriptPath), { recursive: true });
  await writeFile(transcriptPath, JSON.stringify(transcript, null, 2));

  return {
    audioPath,
    transcriptPath,
    transcript,
    durationSeconds,
  };
}

export { extractAudioWav16kMono, probeDurationSeconds } from './audio.js';
export { transcribe } from './transcribe.js';
export { transcribeLocal } from './transcribe-local.js';
export {
  transcribeOpenAi,
  transcribeOpenAiCompatible,
} from './transcribe-remote.js';
