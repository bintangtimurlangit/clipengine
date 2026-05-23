import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TranscriptionSettings } from '@clipengine/schemas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { transcribe } from '../src/ingest/transcribe.js';
import { transcribeOpenAi, transcribeOpenAiCompatible } from '../src/ingest/transcribe-remote.js';

let tmp: string;
let audioPath: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'clipengine-ingest-'));
  audioPath = join(tmp, 'audio_16k_mono.wav');
  // 4 zero bytes: enough to satisfy fs.readFile; the fake fetch
  // doesn't care about the contents.
  writeFileSync(audioPath, Buffer.alloc(4));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const verboseResponse = {
  language: 'en',
  duration: 8.5,
  text: 'Hello world this is a test',
  segments: [
    { id: 0, start: 0, end: 4.2, text: 'Hello world' },
    { id: 1, start: 4.2, end: 8.5, text: 'this is a test' },
  ],
};

function fakeFetch(captured: { url?: string; init?: RequestInit }): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    captured.url = typeof url === 'string' ? url : url.toString();
    captured.init = init;
    return new Response(JSON.stringify(verboseResponse), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

describe('transcribeOpenAi', () => {
  it('posts a multipart upload to /audio/transcriptions and parses verbose JSON', async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    const doc = await transcribeOpenAi({
      audioPath,
      sourceVideo: '/srv/runs/abc/source.mp4',
      language: 'en',
      apiKey: 'sk-test',
      signal: undefined,
      fetchImpl: fakeFetch(captured),
    });
    expect(captured.url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect((captured.init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect(doc.engine).toBe('openai-whisper-1');
    expect(doc.duration_s).toBe(8.5);
    expect(doc.language).toBe('en');
    expect(doc.segments).toHaveLength(2);
    expect(doc.segments[0]?.text).toBe('Hello world');
    expect(doc.source_video).toBe('source.mp4');
  });

  it('throws on a non-2xx response', async () => {
    const fetchImpl = (async () => new Response('boom', { status: 401 })) as typeof fetch;
    await expect(
      transcribeOpenAi({
        audioPath,
        sourceVideo: 'source.mp4',
        language: null,
        apiKey: 'bad',
        fetchImpl,
      }),
    ).rejects.toThrow(/openai-whisper-1 returned 401/);
  });
});

describe('transcribeOpenAiCompatible', () => {
  it('uses the configured base URL and model', async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    const doc = await transcribeOpenAiCompatible({
      audioPath,
      sourceVideo: 'source.mp4',
      language: null,
      apiKey: 'compat-key',
      baseUrl: 'https://my-stt.local/v1',
      model: 'fast-whisper',
      fetchImpl: fakeFetch(captured),
    });
    expect(captured.url).toBe('https://my-stt.local/v1/audio/transcriptions');
    expect(doc.engine).toBe('compat-fast-whisper');
  });
});

describe('transcribe dispatcher', () => {
  it('routes openai settings to the OpenAI backend', async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    const settings: TranscriptionSettings = {
      backend: 'openai',
      api_key: 'sk-test',
      model: 'whisper-1',
      language: null,
    };
    await transcribe({
      audioPath,
      sourceVideo: 'source.mp4',
      settings,
      fetchImpl: fakeFetch(captured),
    });
    expect(captured.url).toContain('api.openai.com');
  });

  it('routes openai_compatible settings to the compatible backend', async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    const settings: TranscriptionSettings = {
      backend: 'openai_compatible',
      api_key: 'compat-key',
      base_url: 'https://my-stt.local/v1',
      model: 'fast-whisper',
      language: null,
    };
    await transcribe({
      audioPath,
      sourceVideo: 'source.mp4',
      settings,
      fetchImpl: fakeFetch(captured),
    });
    expect(captured.url).toBe('https://my-stt.local/v1/audio/transcriptions');
  });

  it('does not invoke fetch for the local backend', async () => {
    const fetchImpl = vi.fn();
    const settings: TranscriptionSettings = {
      backend: 'local',
      model: 'base',
      language: null,
    };
    // The local backend would shell out to whisper.cpp; we just want
    // to confirm the dispatcher does NOT call fetch for it.
    await expect(
      transcribe({
        audioPath,
        sourceVideo: 'source.mp4',
        settings,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeTruthy();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
