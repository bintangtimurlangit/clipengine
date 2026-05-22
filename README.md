# ClipEngine

Self-hosted video clipper. Drop in a long video, a YouTube URL, or a
livestream link, and ClipEngine pulls out the moments worth keeping —
long-form for YouTube, short-form for TikTok and Reels. You bring your
own keys.

- Upload, YouTube VOD, or live capture
- Transcribe with local Whisper or any OpenAI-compatible API
- Plan cuts with OpenAI, Anthropic, Minimax, or your own endpoint
- Burn-in subtitles and your logo using preset templates you control
- One Docker Compose file. SQLite. No vendor lock-in.

## How it works

```
 ┌──────────┐    ┌────────────┐    ┌─────────────┐    ┌──────────────┐
 │  source  │ -> │   ingest   │ -> │    plan     │ -> │    render    │
 │ upload / │    │ ffmpeg +   │    │ research +  │    │ ffmpeg +     │
 │ youtube  │    │ whisper    │    │ LLM cuts    │    │ subs + logo  │
 └──────────┘    └────────────┘    └─────────────┘    └──────────────┘
                       │                  │                   │
                  transcript.json    cut_plan.json       rendered/*.mp4
```

1. **Source** — upload a file, paste a YouTube VOD URL, or paste a
   livestream URL (record-then-clip).
2. **Ingest** — extract 16 kHz mono audio with `ffmpeg`, transcribe
   with local Whisper or your chosen API.
3. **Plan** — optionally search the web with Tavily and/or Brave for
   context, then ask your LLM to pick the moments worth clipping.
4. **Render** — produce long-form 16:9 and short-form 9:16 MP4s with
   burn-in subtitles, your logo, and a JPEG thumbnail per clip.
5. **Download** — grab the files from the dashboard. No upload
   destinations, no lock-in.

Two presets — long-form and short-form — own everything visual:
dimensions, encoding, logo placement, subtitle style. Presets are
plain JSON: export, share, version, re-import.

## Quick start (Docker)

```
git clone https://github.com/bintangtimurlangit/clipengine.git
cd clipengine
cp deploy/.env.example .env
docker compose -f deploy/compose.yaml up -d
```

Open http://localhost:3000, complete the three-step onboarding (account,
transcription, LLM), and start clipping.

## Development

```
pnpm install
pnpm dev          # starts apps/web and apps/api with hot reload
pnpm typecheck
pnpm test
pnpm lint
```

Requires Node.js 22 LTS, pnpm 9, FFmpeg, and yt-dlp on the host.

## Documentation

- [How it works](docs/overview/how-it-works.md)
- [Architecture](docs/overview/architecture.md)
- [Self-hosting with Docker](docs/self-host/docker.md)
- [Bare metal install](docs/self-host/bare-metal.md)
- [Configuration: LLM, transcription, search, workers](docs/configuration/)
- [REST API reference](docs/api/overview.md)
- [Per-module internals](docs/modules/)
- [Preset schema](docs/reference/preset-schema.md)
- [Commit conventions](docs/reference/commit-conventions.md)

## Roadmap

- Upload, YouTube VOD, and YouTube live capture.
- Two presets (long-form 16:9, short-form 9:16) with logo and subtitle
  customization.
- Three-step onboarding, single-admin auth, Docker self-host.
- Multi-user, rolling-chunk live clipping, and a hosted ClipEngine
  Cloud tier later on.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and use Conventional Commits
with DCO sign-off (`git commit -s`). PRs target the `dev` branch.

## License

ClipEngine is licensed under the **Sustainable Use License**.

You can self-host, modify, and share it freely for personal use or
inside your own business. You **cannot** sell it, run a paid hosted
ClipEngine for others, or embed it in a paid product. See
[LICENSE.md](LICENSE.md) and [LICENSING.md](LICENSING.md).

Copyright © 2026 Bintang Timurlangit.
