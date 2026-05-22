# Runs

A run is one source video pushed through ingest → plan → render. Each
run lives in its own workspace directory, has its own log stream, and
ends in `completed`, `failed`, or `cancelled`.

## Starting a run

From the dashboard:

1. Pick a source: paste a YouTube VOD URL, paste a YouTube live URL,
   or upload a file.
2. Pick at least one preset (longform, shortform, or both).
3. Optional title. Defaults to the YouTube URL or the uploaded
   filename.
4. **Start run** posts to `POST /api/runs`. The browser routes to
   `/runs/:id` and the worker picks the run up within a polling
   interval.

## Status

The run detail page shows a status badge that updates over SSE:

| Status | Meaning |
|---|---|
| `queued` | Created. Waiting for a worker slot. |
| `acquiring` | yt-dlp is downloading or recording the source. |
| `transcribing` | ffmpeg extracted audio; Whisper is running. |
| `researching` | LLM picked queries; Tavily / Brave is querying. |
| `planning` | LLM is generating the cut plan. |
| `rendering` | ffmpeg is encoding clips one by one. |
| `completed` | Every clip rendered. Artifacts ready to download. |
| `failed` | Terminal. `error_code` and `error_message` explain what went wrong. |
| `cancelled` | Cancelled by the user. Partial artifacts may exist. |

## Activity log

The detail page subscribes to `GET /api/runs/:id/stream`. Every line
the worker writes (one per stage transition, plus per-clip start /
done) lands in the activity panel as it happens.

If the SSE connection drops, the page also keeps polling `GET
/api/runs/:id` and `/api/runs/:id/logs` so a refresh always shows the
latest state.

## Cancel

The Cancel button (visible until the run reaches a terminal status)
sets `cancel_requested = true` and aborts the worker's per-run
controller. Subprocesses (ffmpeg, yt-dlp, whisper.cpp) catch SIGTERM
and finalize cleanly.

For YouTube live captures, use **Stop live capture** instead. Same
mechanism, different button label so the UI matches the user's
intent.

## Output

Artifacts are listed in the **Outputs** card with kind, mime, and
relative path. Download links land directly on the file. Each clip
ships three files:

```
rendered/longform/01_my-clip.mp4
rendered/longform/01_my-clip.mp4.jpg
rendered/longform/01_my-clip.mp4.caption.txt
```

The `.caption.txt` holds the LLM-generated title and publish
description, ready to paste into a YouTube / Reels / TikTok upload.

## Restart

A failed or cancelled run can't be restarted in place. Start a new
one — the source URL or upload re-runs the pipeline from scratch.
This is intentional: failures usually mean the source itself was
unreachable, the API key rotated, or a setting changed, and silently
re-running with stale state would surprise the user.

## Auto-cleanup

Runs do not auto-delete. The workspace volume grows monotonically
until you prune it. A small monthly cron is fine:

```bash
docker compose -f deploy/compose.yaml exec api \
    sh -c 'find /workspace/runs -mindepth 1 -maxdepth 1 -mtime +30 -exec rm -rf {} +'
```

A built-in retention setting will land later.
