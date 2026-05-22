# Error codes

Stable codes the API returns on `runs.error_code`. The schema is in
`@clipengine/schemas/run.ts`.

| Code | Meaning | Typical cause |
|---|---|---|
| `source_unreachable` | Acquisition failed before the pipeline could run. | yt-dlp couldn't reach the URL; the upload registry returned an unknown id; the source file doesn't exist on disk. |
| `source_too_large` | Upload exceeded the configured `MAX_UPLOAD_BYTES`. | Files over 10 GB by default. Raise the cap if you have a reason to. |
| `transcription_failed` | The chosen STT backend returned an error. | Local: whisper.cpp build failed; remote: 4xx / 5xx response; auth invalid. |
| `llm_unconfigured` | Settings missing — onboarding incomplete. | Pipeline ran before `transcription` or `llm` was saved. The API also returns 400 from `/api/runs` when the user is mid-onboarding, but a race can land the run in `failed` here. |
| `llm_failed` | Every profile in the LLM chain returned an error. | Bad keys, model deprecated, rate limit, empty response. |
| `search_failed` | Both providers returned non-result errors. | Both keys invalid, both providers down. The pipeline does NOT mark a run failed when search returns `null`; that's a graceful skip. This code shows up only when both providers actually errored before yielding `null`. |
| `render_failed` | ffmpeg returned non-zero. | Source codec unsupported; logo file missing; subtitle file malformed. The run log shows the last 240 chars of stderr. |
| `cancelled` | Cooperative cancel. | User clicked Cancel or Stop Live; the controller aborted before completion. |
| `internal` | Anything else. | Unhandled exception. Check `error_message` and the run log. |

## How to investigate

1. Open the run detail page; the activity log (also queryable via
   `GET /api/runs/:id/logs`) shows what each stage did.
2. Cross-reference the failed stage with the `error_message` —
   most user-facing errors are passed straight through.
3. For `internal`, the api container's stdout has the full stack
   trace.

## Reporting

If you hit `internal` with a stack trace that doesn't match a known
issue, please file a bug at
https://github.com/bintangtimurlangit/clipengine/issues with:

- The run id (so you can locate the row).
- The contents of `error_message`.
- The matching api container logs at the time of failure.
- The Docker compose version (or bare-metal Node version).

Don't paste API keys or run audio. The transcript is fine to share
if you want; cut plans usually contain the most useful clues.
