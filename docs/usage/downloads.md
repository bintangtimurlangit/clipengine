# Downloads

Every clip ships three files. They sit in the run's workspace
directory and the run detail page surfaces them as artifact rows.

## What you get per clip

```
rendered/longform/01_my-clip.mp4              # the video
rendered/longform/01_my-clip.mp4.jpg          # 1/3-mark thumbnail
rendered/longform/01_my-clip.mp4.caption.txt  # title + description
```

Same shape under `rendered/shortform/`. The leading number (`01_`)
is the LLM's preferred order; rename freely.

## Caption file

Plain text, two paragraphs:

```
Why You're Wrong About Shipping Containers

A two-minute clip on the most common myth about freight rates. Pulled
from the original podcast around the 14:00 mark.
```

The first line is the clip's title; everything after the blank line
is the publish description. Paste into your YouTube / Reels / TikTok
upload form.

## Bulk export

Tar the whole run directory:

```bash
docker compose -f deploy/compose.yaml exec api \
    tar czf - -C /workspace/runs/<run-id> rendered \
    > clip-pack.tar.gz
```

Or `rsync` the workspace volume to local disk on a schedule.

## Why no built-in upload

Shipping a "publish to YouTube" button means OAuth flows, channel
selection, quota tracking, and a long tail of platform changes. ClipEngine
v1 stops at producing files. Use the YouTube / TikTok / Reels CLI
tools you trust — they all accept these files unmodified.
