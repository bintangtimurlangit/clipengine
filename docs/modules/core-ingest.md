# `core/ingest`

The first stage. Turns a source video into a normalized
`TranscriptDoc` and an `audio_16k_mono.wav` next to it.

## Public entry

```ts
runIngest({
  source: '/workspace/runs/<id>/source.mp4',
  workspaceDir: '/workspace/runs/<id>',
  transcription: { backend, ... },          // validated user setting
  audioStreamIndex?: 0,
  binaries?: { ffmpeg, ffprobe },
  signal?: AbortSignal,
}) -> { audioPath, transcriptPath, transcript, durationSeconds }
```

Three steps:

1. `probeDurationSeconds()` — `ffprobe -show_entries format=duration`.
   Uses default 30 s timeout.
2. `extractAudioWav16kMono()` — `ffmpeg -ac 1 -ar 16000 -c:a
   pcm_s16le`. The `-map 0:a:N` flag lets multi-track sources pick a
   stream. 10-minute default timeout.
3. `transcribe()` dispatches to one of three backends.

The composed result is written to `<workspace>/transcript.json`.

## Backends

### `transcribe-local.ts`

`nodejs-whisper` wraps `whisper.cpp`. We pass the WAV path, the model
name, and the optional language. The library writes its verbose JSON
output next to the input WAV; we read it and delete it.

Output is normalized into the canonical `TranscriptDoc` shape
(seconds, not centiseconds; trimmed text; engine label
`whisper-<model>`).

### `transcribe-remote.ts`

Shared multipart uploader for OpenAI's
`POST /audio/transcriptions` and any compatible endpoint. Uses
`response_format=verbose_json` plus `timestamp_granularities[]=segment`.

`fetchImpl` is a test-only seam: tests stub the fetch to skip a real
HTTP server.

`transcribeOpenAi()` defaults to `https://api.openai.com/v1` and
`whisper-1`. `transcribeOpenAiCompatible()` requires both
`base_url` and `model`.

### `transcribe.ts`

Dispatcher keyed on the validated `TranscriptionSettings.backend`
discriminant. Adds nothing else — pure switch.

## Cancellation

Every subprocess call (`ffprobe`, `ffmpeg`, `whisper.cpp`) gets the
caller's `AbortSignal` through `runCommand`. SIGTERM propagates;
nodejs-whisper finalizes any partial output cleanly.

The remote backends pass the signal directly into `fetch`, so cancel
during transcription aborts the in-flight request.

## Error handling

- `probeDurationSeconds` throws `Error('ffprobe: could not parse
  duration')` when ffprobe returns garbage. The pipeline turns that
  into `error_code: 'source_unreachable'` because it usually means
  the file isn't a valid video.
- Remote 4xx / 5xx surfaces as `Error('transcribe: <engine> returned
  <status>')`. Becomes `error_code: 'transcription_failed'`.
- The local backend logs into `console`; the worker captures stderr
  and pipes it into the run log.

## Files

- `audio.ts` — `probeDurationSeconds`, `extractAudioWav16kMono`.
- `transcribe.ts` — dispatcher.
- `transcribe-local.ts` — whisper.cpp.
- `transcribe-remote.ts` — OpenAI + compat.
- `index.ts` — `runIngest` and re-exports.

## Tests

`packages/core/tests/ingest.test.ts` covers the OpenAI multipart
shape, the configurable base URL + model, error propagation on
non-2xx responses, dispatcher routing, and confirms the dispatcher
does NOT call fetch for the local backend.
