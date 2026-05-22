# Changelog

All notable changes to ClipEngine are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
once it reaches v1.0.0.

## [Unreleased]

### Added
- Monorepo scaffolding: pnpm workspaces, Turborepo, Biome, shared
  TypeScript configs.
- Sustainable Use License (fair-code, n8n-style). Free for personal
  and internal business use; no commercialization without permission.
  See [LICENSE.md](LICENSE.md) and [LICENSING.md](LICENSING.md).
- Conventional Commits + DCO contributor workflow
  ([CONTRIBUTING.md](CONTRIBUTING.md),
  [docs/reference/commit-conventions.md](docs/reference/commit-conventions.md)).
- `@clipengine/schemas` — Zod schemas for preset, run, source,
  settings, and API shapes. 23 unit tests cover validation rules.
- `@clipengine/db` — Drizzle ORM with SQLite-first, Postgres-ready
  schema (10 tables: user / session / account / verification /
  setting / logo / preset / run / run_log / run_artifact). Typed
  repos with Zod validation on every JSON read/write. Atomic queue
  claim for the worker pool.
- `@clipengine/llm-providers` — AI SDK adapters for OpenAI,
  Anthropic, and OpenAI-compatible. Primary + fallback chain;
  `testLlmConnection()` probe.
- `@clipengine/search-providers` — Tavily and Brave web search
  adapters with main + fallback chain.
- `@clipengine/core/ingest` — ffmpeg audio probe + WAV extraction;
  three transcription backends (local whisper.cpp, OpenAI Whisper
  API, custom OpenAI-compatible).
- `@clipengine/core/plan` — research stage (LLM-derived queries +
  search chain), cut-plan generation with Zod-constrained LLM
  output, and Whisper segment snap.
- `@clipengine/core/render` — geometry (16:9 fit-pad, 9:16
  cover-crop), logo overlay, libass subtitle burn-in, thumbnails,
  captions.
- `apps/api` — Hono server with Better Auth (username plugin), full
  REST surface (settings / onboarding / presets / logos / sources /
  runs), in-process worker pool with cooperative cancel, SSE per-run
  progress stream, yt-dlp VOD + live capture, chunked upload
  registry. 26 vitest cases.
- `apps/web` — Next.js 16 + Tailwind v4 + shadcn UI. Registration
  page, three-step onboarding (transcription / LLM / search) with
  live Test Connection probes, dashboard new-run form, runs list
  with status polling, run detail page with live SSE log streaming
  and Cancel / Stop Live, preset list + editor + import/export,
  logos library, settings tabs.
- Docker images for api and web (multi-arch amd64 + arm64) plus a
  production compose stack and dev hot-reload stack. Deploy
  walkthroughs for Coolify, Railway, Fly, and bare metal.
- Full documentation under `docs/` covering architecture, pipeline,
  self-host, configuration, REST API, and per-package internals.

### Removed
- Legacy v1 Python codebase (FastAPI + `clipengine` library, Next.js
  catalog/automation/integrations). v2 is a clean-slate TypeScript
  rewrite.

[Unreleased]: https://github.com/bintangtimurlangit/clipengine/compare/main...dev
