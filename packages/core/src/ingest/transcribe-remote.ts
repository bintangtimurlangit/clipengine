/**
 * OpenAI-compatible transcription backend.
 *
 * Same code path serves the official OpenAI `audio/transcriptions`
 * endpoint and any custom OpenAI-compatible endpoint (Groq, custom
 * Whisper proxies, etc.). The only difference is `baseUrl` and
 * `model`; we never special-case the official OpenAI host.
 *
 * The endpoint accepts a multipart upload with the audio file and
 * returns a JSON document with `language`, `duration`, and
 * timestamped `segments` when `response_format=verbose_json` is
 * requested.
 */

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { TranscriptDoc, TranscriptSegment } from '@clipengine/schemas';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'whisper-1';

export interface TranscribeRemoteOptions {
  audioPath: string;
  sourceVideo: string;
  /** ISO-639-1 language code. `null` lets the API auto-detect. */
  language: string | null;
  /** Bearer key used for the `Authorization` header. */
  apiKey: string;
  /** Optional override; defaults to OpenAI for the `openai` backend. */
  baseUrl?: string;
  /** Defaults to `whisper-1` for the `openai` backend. */
  model?: string;
  signal?: AbortSignal;
  /**
   * Override the global fetch implementation. Tests use this to
   * stub the multipart request without spinning up a real HTTP server.
   */
  fetchImpl?: typeof fetch;
}

interface OpenAiVerboseSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

interface OpenAiVerboseResponse {
  language?: string;
  duration?: number;
  text?: string;
  segments?: OpenAiVerboseSegment[];
}

async function callOpenAiCompatible(
  opts: TranscribeRemoteOptions,
  baseUrl: string,
  model: string,
  engineLabel: string,
): Promise<TranscriptDoc> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const audioBytes = await readFile(opts.audioPath);
  const blob = new Blob([new Uint8Array(audioBytes)], { type: 'audio/wav' });
  const form = new FormData();
  form.append('file', blob, basename(opts.audioPath));
  form.append('model', model);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');
  if (opts.language) {
    form.append('language', opts.language);
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/audio/transcriptions`;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}` },
    body: form,
    signal: opts.signal,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`transcribe: ${engineLabel} returned ${res.status} ${res.statusText}: ${body}`);
  }

  const json = (await res.json()) as OpenAiVerboseResponse;
  const segments: TranscriptSegment[] = (json.segments ?? []).map((s) => ({
    start_s: Math.max(0, s.start),
    end_s: Math.max(s.start, s.end),
    text: s.text.trim(),
  }));

  return {
    source_video: basename(opts.sourceVideo),
    duration_s: json.duration ?? segments.at(-1)?.end_s ?? 0,
    language: json.language ?? opts.language ?? null,
    segments,
    engine: engineLabel,
  };
}

/** Transcribe via the official OpenAI Whisper API. */
export async function transcribeOpenAi(opts: TranscribeRemoteOptions): Promise<TranscriptDoc> {
  const baseUrl = opts.baseUrl ?? DEFAULT_OPENAI_BASE_URL;
  const model = opts.model ?? DEFAULT_OPENAI_MODEL;
  return callOpenAiCompatible(opts, baseUrl, model, `openai-${model}`);
}

/** Transcribe via any OpenAI-compatible audio endpoint. */
export async function transcribeOpenAiCompatible(
  opts: TranscribeRemoteOptions & { baseUrl: string; model: string },
): Promise<TranscriptDoc> {
  return callOpenAiCompatible(opts, opts.baseUrl, opts.model, `compat-${opts.model}`);
}
