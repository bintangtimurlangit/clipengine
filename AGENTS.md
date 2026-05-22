# Agent / contributor notes

This file is the short reference for AI agents and human contributors
working in this repo. Hard rules first; details below.

## Hard rules

1. **Conventional Commits** — every commit, every branch. See
   [`docs/reference/commit-conventions.md`](docs/reference/commit-conventions.md)
   and [`CONTRIBUTING.md`](CONTRIBUTING.md). PR titles are linted in CI.
2. **Branches** — never commit directly to `main`. Default dev branch is
   `dev`. Feature work lives on `feat/<slug>`, `fix/<slug>`,
   `docs/<slug>`, `chore/<slug>`. PRs target `dev`.
3. **DCO sign-off** — `git commit -s` on every commit. CI rejects
   unsigned commits.
4. **Language** — TypeScript everywhere. No new Python.
5. **License** — Sustainable Use License (fair-code, n8n-style).
   Don't add dependencies whose license is incompatible with
   redistribution under SUL (no GPL-2.0-only, no AGPL-3.0). Permissive
   (MIT, Apache-2.0, BSD, ISC, MPL-2.0) is fine.
6. **Docs** — when you change a module, update the matching page in
   `docs/`. README and `docs/configuration/*` cover user-visible
   behavior; `docs/modules/*` covers internals.

## Repository layout

```
apps/
  web/                  Next.js 16 + shadcn UI (browser)
  api/                  Hono backend + in-process worker pool
packages/
  core/                 Engine: ingest, plan, render (TypeScript)
  schemas/              Zod schemas (preset, run, settings, api)
  db/                   Drizzle ORM, SQLite-first, Postgres-ready
  llm-providers/        AI SDK adapters (OpenAI, Anthropic, OpenAI-compat)
  search-providers/     Tavily + Brave
  tsconfig/             Shared tsconfig presets
deploy/
  docker/               Dockerfiles
  examples/             Coolify, Fly, Railway, Dokku, bare metal
docs/
  overview/             How it works, architecture, pipeline diagram
  self-host/            Docker, bare metal, env vars, upgrades
  usage/                Onboarding, runs, presets, logos, downloads
  configuration/        LLM, transcription, search, workers, auth
  api/                  REST API + auto-generated openapi.json
  modules/              Per-package internals
  reference/            commit-conventions, preset-schema, error-codes
scripts/                dev.sh, seed.ts, docs-openapi.ts, build.sh
.github/                Workflows + dependabot
```

## Tooling

- **Package manager**: `pnpm` (workspaces) + `turbo` for orchestration.
- **Lint + format**: [Biome](https://biomejs.dev/). `pnpm lint`,
  `pnpm format`.
- **Tests**: [Vitest](https://vitest.dev/). `pnpm test`.
- **Type-check**: `pnpm typecheck`.
- **Database**: SQLite by default (`drizzle-orm` + `better-sqlite3`).
  Schema is Postgres-compatible; we'll switch backends in cloud.
- **Auth**: [Better Auth](https://www.better-auth.com/).
- **LLM**: [AI SDK](https://sdk.vercel.ai/) with three adapters
  (OpenAI, Anthropic, OpenAI-compatible).
- **Search**: Tavily SDK and Brave web search REST API.
- **Local STT**: `nodejs-whisper` (whisper.cpp). Default model: `base`.
- **Remote STT**: OpenAI Whisper API or any OpenAI-compatible endpoint.
- **Video**: system `ffmpeg` and `yt-dlp`, called via `execa`.

## Working agreements

- **Plan first** for non-trivial work. Discuss tradeoffs before writing
  code; the user prefers being asked over guessed-at decisions.
- **Small commits**, scoped to one purpose. The "right" commit is one
  Conventional Commit message.
- **Verify** — after a change, run the project's typecheck/test/lint.
  State what was checked and what couldn't be.
- **Don't generate URLs** unless they come from the user, official docs,
  or a tool result.
- **Never commit secrets**. `.env*` files are gitignored except for
  `deploy/.env.example`.

## Skills

Skills under `.agents/skills/` provide focused workflows. Load them via
the `skill` tool when the task matches:

- `frontend-design` — distinctive, production-grade UI.
- `shadcn` — adding/composing/styling shadcn components.
- `customize-opencode` — only when editing this agent's own config.

## Out of scope right now

- Multi-tenant SaaS auth (`Better Auth` plugins for orgs/Stripe come
  later, but the data model already accommodates it).
- Rolling-chunk live clipping (live capture v1 is record-then-clip).
- GPU-accelerated local Whisper via CTranslate2 (we run whisper.cpp
  for now; a Python sidecar can be added later if needed).
