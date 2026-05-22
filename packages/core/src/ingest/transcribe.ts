/**
 * Transcription dispatcher.
 *
 * Picks a backend based on the validated `TranscriptionSettings` blob
 * the user saved through the API. The actual implementations live in
 * sibling files; this module is the single entry point the rest of
 * the engine uses.
 */

import type { TranscriptDoc, TranscriptionSettings } from '@clipengine/schemas';
import { transcribeLocal } from './transcribe-local.js';
import {
  type TranscribeRemoteOptions,
  transcribeOpenAi,
  transcribeOpenAiCompatible,
} from './transcribe-remote.js';

export interface TranscribeOptions {
  /** Path to the WAV produced by `extractAudioWav16kMono`. */
  audioPath: string;
  /** Original video path; recorded in the transcript for traceability. */
  sourceVideo: string;
  /** Validated user settings choosing the backend. */
  settings: TranscriptionSettings;
  signal?: AbortSignal;
  /** Test-only fetch override forwarded to remote backends. */
  fetchImpl?: typeof fetch;
}

/**
 * Run the transcription stage and return a normalized
 * {@link TranscriptDoc}. Throws if the configured backend is
 * unreachable or returns malformed data.
 */
export async function transcribe(opts: TranscribeOptions): Promise<TranscriptDoc> {
  const { settings } = opts;
  switch (settings.backend) {
    case 'local':
      return transcribeLocal({
        audioPath: opts.audioPath,
        sourceVideo: opts.sourceVideo,
        model: settings.model,
        language: settings.language,
        signal: opts.signal,
      });
    case 'openai': {
      const remote: TranscribeRemoteOptions = {
        audioPath: opts.audioPath,
        sourceVideo: opts.sourceVideo,
        language: settings.language,
        apiKey: settings.api_key,
        model: settings.model,
        signal: opts.signal,
        fetchImpl: opts.fetchImpl,
      };
      return transcribeOpenAi(remote);
    }
    case 'openai_compatible':
      return transcribeOpenAiCompatible({
        audioPath: opts.audioPath,
        sourceVideo: opts.sourceVideo,
        language: settings.language,
        apiKey: settings.api_key,
        baseUrl: settings.base_url,
        model: settings.model,
        signal: opts.signal,
        fetchImpl: opts.fetchImpl,
      });
  }
}
