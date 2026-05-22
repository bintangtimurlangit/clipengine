# Transcription

ClipEngine has three transcription backends. Pick one in onboarding;
change it any time from Settings → Transcription.

## Local Whisper (default)

- Library: [`nodejs-whisper`](https://www.npmjs.com/package/nodejs-whisper),
  which wraps [whisper.cpp](https://github.com/ggerganov/whisper.cpp).
- Models: `tiny` (~75 MB), `base` (~150 MB, recommended for v1),
  `small`, `medium`, `large-v3` (~3 GB).
- First run compiles whisper.cpp (cmake + g++ + git). Subsequent runs
  reuse the binary; switching models downloads a new GGML weights
  file once.
- CPU-friendly, GPU optional. The Docker image runs on CPU.
- Returns timestamped segments matched to the input audio. Quality
  scales with model size; `base` is fine for the cuts we make.

Configuration shape:

```json
{
  "backend": "local",
  "model": "base",
  "language": null
}
```

`language` is an ISO-639-1 code (`en`, `id`, `ja`, …). `null` lets
Whisper auto-detect.

## OpenAI Whisper API

- Endpoint: `POST https://api.openai.com/v1/audio/transcriptions`.
- Default model: `whisper-1`. Override per-profile.
- Returns the same segment structure ClipEngine expects (verbose
  JSON with timestamp granularities).

Configuration:

```json
{
  "backend": "openai",
  "api_key": "sk-…",
  "model": "whisper-1",
  "language": null
}
```

The Test Connection probe hits `GET /v1/models` with the key — fast
and free.

## Custom OpenAI-compatible endpoint

For Groq's Whisper, a self-hosted Whisper proxy, or any service that
implements the same `/audio/transcriptions` shape:

```json
{
  "backend": "openai_compatible",
  "api_key": "<key>",
  "base_url": "https://my-stt.example.com/v1",
  "model": "whisper-large-v3",
  "language": null
}
```

The renderer talks to the endpoint over plain HTTP — bring your own
TLS proxy if needed.

## Switching backends

Open Settings → Transcription, click **Re-run onboarding**, pick the
new backend, save. The next run uses the new setting; in-flight runs
keep the backend they started with.

## Trade-offs

| Backend | Cost | Speed (CPU) | Privacy |
|---|---|---|---|
| Local | $0 | Slow on CPU; reasonable on GPU | Source never leaves the box |
| OpenAI | ~$0.006/minute | Fast | Audio uploaded to OpenAI |
| Custom | Whatever your provider charges | Depends | Depends |

For VPS deployments without GPU, a remote backend is usually better
unless privacy is the priority. The plan + render stages still run
locally regardless of which transcription backend you pick.
