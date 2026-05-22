# Run state machine

Linear, with one branch (research is skipped when search is
disabled) and three terminal states.

```
            ┌──────────┐
            │  queued  │
            └────┬─────┘
                 │ pool.claimNextQueued()
                 ▼
            ┌──────────────┐
            │  acquiring   │  resolveSource(): yt-dlp / upload finalize
            └─────┬────────┘
                  │ source ready
                  ▼
            ┌──────────────────┐
            │  transcribing    │  ffprobe + ffmpeg + whisper.cpp / API
            └─────┬────────────┘
                  │ transcript.json written
                  ▼
       ┌──────────────────┐  search disabled?
       │   researching    │ ◀──── no ── yes ──┐
       │   (Tavily/Brave) │                   │
       └─────┬────────────┘                   │
             │                                │
             ▼                                ▼
            ┌──────────────┐
            │   planning   │  LLM cut-plan call + segment snap
            └─────┬────────┘
                  │ cut_plan.json written
                  ▼
            ┌──────────────┐
            │  rendering   │  ffmpeg per clip + thumbnail + caption
            └─────┬────────┘
                  │ all clips rendered
                  ▼
            ┌──────────────┐
            │  completed   │   (terminal)
            └──────────────┘

Anywhere above:
  cancel_requested = true OR controller.abort()
       └──▶ ┌──────────────┐
            │  cancelled   │   (terminal)
            └──────────────┘

Any unhandled error from a stage:
       └──▶ ┌──────────────┐
            │   failed     │   (terminal, with error_code + error_message)
            └──────────────┘
```

## Transitions

| From | Transition | To |
|---|---|---|
| `queued` | `pool.claimNextQueued()` (atomic) | `acquiring` |
| `acquiring` | source acquired | `transcribing` |
| `transcribing` | transcript written, search disabled | `planning` |
| `transcribing` | transcript written, search enabled | `researching` |
| `researching` | research done | `planning` |
| `planning` | cut plan written | `rendering` |
| `rendering` | all clips done | `completed` |
| any non-terminal | cancel | `cancelled` |
| any non-terminal | unhandled error | `failed` |

Once a run is `completed`, `failed`, or `cancelled`, it stays there.
There's no in-place restart — start a new run with the same source.

## Cancel timing

Cancel checks happen between stages and inside subprocesses:

- The pipeline calls `checkCancel(signal)` between every major
  step.
- Subprocesses (ffmpeg, yt-dlp, whisper.cpp) catch SIGTERM through
  the per-run AbortController.
- The AI SDK threads the signal into its fetch call.
- The Brave adapter accepts the signal directly; Tavily uses its
  SDK's `signal?.throwIfAborted()`.

After the cancel, the worker awaits any in-flight subprocess to
exit before marking the run `cancelled`. Partial files in the
workspace are left in place — easier to debug than scrubbing them.

## Error codes

See [error-codes.md](error-codes.md) for the catalog.
