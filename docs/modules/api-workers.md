# `apps/api/workers`

The worker pool is in-process: one polling loop, one bounded
semaphore, no queueing daemon.

## Files

- `pool.ts` — `WorkerPool`, the polling loop and concurrency
  semaphore.
- `pipeline.ts` — `runPipeline()`, one run end-to-end through ingest
  / plan / render. `RunCancelled` discriminates cooperative cancel
  from real failure.
- `progress.ts` — `createProgressWriter()`. Fused helper that writes
  to the `run_log` table, flips status, and emits to `RunEventBus`
  in one call.
- `../lib/redact.ts` — strips bearer tokens, provider API keys, and
  API-key headers before worker errors or progress details reach the
  database or SSE stream.

## How a run flows through

1. `pool.tick()` reads concurrency from settings, then loops
   `RunsRepo.claimNextQueued()` until either the queue is empty or
   `inFlight === concurrency`.
2. Each claim spawns under its own AbortController. The pool keeps
   the controllers in a Map keyed by run id so `cancel(id)` can find
   and abort one.
3. `pool.execute(run, controller)`:
   - Sets status to `acquiring` and emits the matching SSE.
   - Calls `options.resolveSource(run, controller.signal)` — the
     seam that runs yt-dlp / finalizes the upload.
   - Calls `runPipeline()` with the resolved source path.
   - Catches `RunCancelled` -> `markCancelled` + emit `cancelled`.
   - Catches any other error -> `markFailed` with `internal` (or
     `cancelled` when the controller was aborted) + emit `failed`.
     The stored and emitted message is redacted first.

## Pipeline steps (`pipeline.ts`)

```
checkCancel(signal)
setStatus('transcribing')
runIngest(...)
addArtifact(transcript, audio)
checkCancel(signal)
setStatus(search.disabled ? 'planning' : 'researching')
runPlan(...)
addArtifact(cut_plan)
checkCancel(signal)
setStatus('rendering')
runRender(...) with onClipStart / onClipDone -> bus events
addArtifact(...) for every rendered file
markCompleted
```

`checkCancel(signal)` throws `RunCancelled` when the controller has
been aborted.

`runRender`'s callbacks feed per-clip status into the bus so the UI
shows progress without a separate channel.

## Log redaction

Worker logs, progress details, and failure messages pass through
`redactSecrets()` before they are written to `run_log`, stored on the
run row, or emitted over SSE. This protects common leak paths such as
subprocess output echoing signed URLs, provider SDK errors including
`Authorization` headers, or failed probes printing API keys.

## Settings snapshot

`runPipeline` reads `transcription`, `llm`, and `search` settings
once at the top. In-flight runs keep their snapshot; new runs see
the current state. This means a user can edit settings without
breaking an active render.

## Cancel mechanics

`pool.cancel(id)` aborts the controller. The signal flows into:

- `resolveSource()` — yt-dlp catches SIGTERM and finalizes the file.
- `runIngest()` -> `extractAudioWav16kMono` (ffmpeg) and
  `transcribe()` (subprocess or fetch).
- `runPlan()` -> `generateObject` (the AI SDK threads the signal
  into its fetch call) and `runSearchChain()` (Tavily / Brave fetch).
- `runRender()` -> ffmpeg per clip.

Every subprocess our code spawns goes through `@clipengine/core`'s
`runCommand` / `runCommandLossy`, which wires the signal into
`execa` for clean SIGTERM handling.

## SSE bus (`pubsub/run-events.ts`)

`RunEventBus` is an `EventEmitter` keyed by run id. Subscribers
register a callback for one run; the worker emits on the same id.
Max listeners is set to `0` (unlimited) so multiple browsers can
follow the same run without warnings.

## Tests

`apps/api/tests/worker-pool.test.ts` covers:

- Queued runs land in `failed` when the source path is missing.
- `cancel()` flips an in-flight run to cancelled / failed cleanly.
- Runs are claimed in FIFO order under default concurrency = 1.
