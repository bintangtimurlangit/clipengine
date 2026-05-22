# `@clipengine/schemas`

Zod schemas that act as the single source of truth for ClipEngine data
shapes. Used by `apps/api` (request/response validation), `packages/db`
(typed columns), `packages/core` (engine inputs/outputs), and
`apps/web` (typed client).

## What lives here

- `preset.ts` — versioned preset schema (`schema_version`), with a
  `migrate(rawJson)` helper for forward compatibility.
- `run.ts` — run state, source descriptors, artifacts.
- `source.ts` — upload / YouTube VOD / YouTube live source types.
- `settings.ts` — per-user settings KV blobs.
- `api.ts` — request and response shapes for routes in `apps/api`.

## Conventions

- Every schema exports both the Zod schema (`PresetSchema`) and the
  inferred TypeScript type (`Preset`).
- Breaking changes to a schema bump `schema_version` and add a step to
  `migrate()`. Old exports must keep loading.


