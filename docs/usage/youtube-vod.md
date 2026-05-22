# YouTube VOD

Paste a regular YouTube URL on the dashboard's **YouTube VOD URL**
source and ClipEngine downloads it with `yt-dlp` before transcribing.

## What it does

1. Validates the URL belongs to `youtube.com` or `youtu.be`.
2. Spawns `yt-dlp` with these flags:
   - `--no-playlist` (single video only)
   - `--format 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best'`
     (1080p cap; the renderer scales away anything bigger anyway)
   - `--merge-output-format mp4`
3. Writes the merged file to
   `<WORKSPACE>/runs/<run_id>/source.mp4`.
4. Hands the path to the ingest stage.

## Cancel

Cancelling the run sends SIGTERM to the yt-dlp subprocess. yt-dlp
removes the partial file and exits; the run lands in `cancelled`.

## Errors

Common failures:

- **Video unavailable / age-restricted / region-locked** — yt-dlp
  exits non-zero. The run lands in `failed` with the error message
  attached.
- **Cookies needed** — for some videos yt-dlp needs a logged-in
  cookies file. Self-hosters can mount one and pass
  `cookiesPath` through a custom build; we don't expose this in the
  UI yet.

## Quality

The 1080p cap is hardcoded in `apps/api/src/sources/youtube-vod.ts`.
It's enough for every preset ClipEngine ships and avoids burning disk
on 4K source the renderer would crop or scale anyway. Adjust the
format string if you have a reason to keep higher resolution.
