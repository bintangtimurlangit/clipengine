# Upload

ClipEngine accepts direct file uploads from the browser through a
chunked upload path. Files larger than the 4 MB chunk size are sent
in pieces so a flaky connection or a closed laptop lid doesn't waste
the whole transfer.

## Using the dashboard

On `/dashboard`:

1. Pick **Upload a file** as the source type.
2. Choose a video file. Anything ffmpeg can read is fine — common
   ones are `.mp4`, `.mov`, `.mkv`, `.webm`.
3. Pick at least one preset.
4. **Start run** kicks off the chunked upload. Once every chunk
   lands, the run row is created and the worker picks it up.

The current implementation does not show a progress bar yet; it shows
the run page as soon as the upload finishes and the worker starts
acquiring the source.

## Limits

| Limit | Default | Where |
|---|---|---|
| Chunk size | 4 MB | `apps/web/src/components/runs/new-run-form.tsx` |
| Total size | 10 GB | `apps/api/src/sources/upload.ts` |
| MIME | any | not enforced server-side; ffmpeg fails the run for non-video sources |

The 10 GB cap is a sanity guard. Raise it in `MAX_UPLOAD_BYTES` inside
`apps/api/src/sources/upload.ts` if you have a clean reason to need
larger sources.

## Resumability

The server stages the upload into `<DATA_DIR>/uploads/<userId>/<uploadId>.part`
and tracks `received_size` against `total_size`. The client doesn't
implement resume yet (it always starts at offset 0 in this UI), but
the server-side mechanics are there, so a future client can recover
from a half-finished session by checking `GET
/api/sources/uploads/:id`.

## What gets stored

The upload itself ends up at `<WORKSPACE>/runs/<run_id>/source.<ext>`
once the run starts. The `.part` staging file is deleted on finalize.
If the run never starts (the user closes the tab between upload and
"Start run"), a small orphan stays in the staging directory. Cancel
the upload through the API or just `rm` the file — the server only
remembers in-process state, so a restart drops the registry too.
