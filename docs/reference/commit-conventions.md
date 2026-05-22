# Commit conventions

ClipEngine follows [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).
This document is the canonical, project-specific reference.

> Every commit on every branch must follow these rules. CI lints PR
> titles against them.

## Format

```
<type>(<optional scope>): <imperative description>

[optional body]

[optional footer(s)]
```

- **Description** is imperative ("add feature", not "added feature"),
  starts lowercase, no trailing period, fits on one line (~72 chars).
- **Body** explains *why* the change was made, wrapped at ~80 chars.
- **Footers** carry metadata: `BREAKING CHANGE:`, `Refs:`, `Closes:`,
  `Co-authored-by:`, `Signed-off-by:`.

## Allowed types

| Type | Use for |
|---|---|
| `feat` | A new user-visible feature. |
| `fix` | A bug fix. |
| `docs` | Documentation only. |
| `style` | Formatting, whitespace, missing semicolons. No logic change. |
| `refactor` | Code change that neither fixes a bug nor adds a feature. |
| `perf` | Performance improvement. |
| `test` | Adding or fixing tests. |
| `build` | Build system or external dependency changes (Docker, pnpm). |
| `ci` | CI configuration only (workflows, dependabot, etc.). |
| `chore` | Maintenance with no production code change. |
| `revert` | A revert of a prior commit. |

## Scopes

Lowercase, short, one word when possible. Common scopes:

- `repo` — root config (workspaces, biome, tsconfig, license).
- `web` — `apps/web` (Next.js).
- `api` — `apps/api` (Hono + workers).
- `core` — `packages/core` (engine).
- `schemas` — `packages/schemas` (Zod schemas).
- `db` — `packages/db` (Drizzle, migrations).
- `llm` — `packages/llm-providers`.
- `search` — `packages/search-providers`.
- `deploy` — `deploy/` (Docker, compose, examples).
- `docs` — `docs/`.
- `ci` — `.github/`.

If a change touches multiple areas, prefer the dominant one or omit the
scope. Don't list multiple scopes.

## Breaking changes

Two equivalent ways to mark a breaking change:

1. Add `!` after the type/scope: `feat(api)!: ...`
2. Add a `BREAKING CHANGE:` footer.

The body of a `BREAKING CHANGE:` footer must describe what users have
to do to migrate.

```
feat(api)!: rename /api/runs to /api/v1/runs

BREAKING CHANGE: clients must update the base path to /api/v1.
```

Use both `!` and the footer when the migration deserves explanation.

## Examples

### Good

```
feat(web): add preset import dialog
fix(core): clamp shortform duration to preset bounds
docs(self-host): add Coolify deployment example
chore(deps): bump drizzle-orm to 0.36.0
test(api): cover run cancel during ffmpeg encode
refactor(core)!: split plan stage into research + cut

BREAKING CHANGE: external callers of runPlan() must now pass a
PlannerConfig object; old positional args are gone.
```

### Bad

```
Update files                       # missing type
feat: stuff                        # vague description
fix(api): Fixed the bug.           # capitalized + past tense + period
WIP                                # use draft PR + meaningful commits
[web] add new page                 # wrong format
```

## Tooling

- **Local**: nothing required. Pair `git commit -s` with the format above.
- **CI**: PR titles are linted by `.github/workflows/lint-pr-title.yml`.
- **Optional**: install [`commitlint`](https://commitlint.js.org/) and
  [`husky`](https://typicode.github.io/husky/) locally if you want
  pre-commit enforcement.

## Why

- Auto-generated changelogs (`feat`/`fix` end up in release notes).
- Easy to bisect history by area (`git log --grep="^feat(api)"`).
- Forces small, single-purpose commits.
- Makes upgrades less scary because breaking changes are flagged
  consistently.
