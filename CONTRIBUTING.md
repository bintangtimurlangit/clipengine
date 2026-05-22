# Contributing to ClipEngine

Thanks for considering a contribution. ClipEngine is built in the open
under the [Sustainable Use License](LICENSE.md). You can self-host,
modify, and share it freely for personal or internal business use; you
can't commercialize it. See [LICENSING.md](LICENSING.md) for the
plain-English summary.

This document covers the rules every change must follow. They are short
and non-negotiable so the project history stays clean.

## Commit messages: Conventional Commits

Every commit on every branch must follow the
[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
specification. CI lints PR titles against the same rules.

The full reference lives at
[`docs/reference/commit-conventions.md`](docs/reference/commit-conventions.md).

Format:

```
<type>(<optional scope>): <imperative description>

[optional body]

[optional footer(s)]
```

Allowed types:

- `feat` — a new user-visible feature
- `fix` — a bug fix
- `docs` — documentation only
- `style` — formatting, whitespace, no code change
- `refactor` — code change that neither fixes a bug nor adds a feature
- `perf` — performance improvement
- `test` — adding or fixing tests
- `build` — changes to the build system or external dependencies
- `ci` — CI configuration only
- `chore` — maintenance tasks (no production code change)
- `revert` — revert of a prior commit

Common scopes (use whichever fits, lowercase):

- `web`, `api`, `core`, `db`, `schemas`, `llm`, `search`, `deploy`,
  `docs`, `repo`

Breaking changes:

- Append `!` after the type/scope, **and** add a `BREAKING CHANGE:`
  footer explaining what users have to do.

Examples:

```
feat(api): add /runs/:id/cancel endpoint
fix(core): clamp shortform duration to preset bounds
docs(self-host): add Coolify deployment example
chore(deps): bump drizzle-orm to 0.36.0
refactor(web)!: replace presets store with TanStack Query

BREAKING CHANGE: presets cache key changed; clear localStorage on upgrade.
```

## Branches

- Never commit directly to `main`.
- Default development branch is `dev`.
- Feature work goes on a branch named `feat/<short-slug>`,
  `fix/<short-slug>`, `docs/<short-slug>`, etc.
- Open pull requests against `dev`. Releases merge `dev` into `main`.

## Sign-off (DCO)

Every commit must be signed off with the
[Developer Certificate of Origin](https://developercertificate.org/).
This certifies that you wrote the change or have the right to submit it,
and lets the copyright holder distribute the project under different
license terms in the future if needed.

Sign off automatically by adding `-s`:

```
git commit -s -m "feat(web): add preset import dialog"
```

This appends a line like:

```
Signed-off-by: Your Name <you@example.com>
```

Pull requests without DCO sign-off will fail CI.

## Code style

- TypeScript everywhere; no `any` without an explanatory comment.
- [Biome](https://biomejs.dev/) is the linter and formatter.
  Run `pnpm format` before committing or rely on the editor integration.
- Tests use [Vitest](https://vitest.dev/). Run `pnpm test`.
- Type-check with `pnpm typecheck`. CI runs all three.

## Pull request checklist

- [ ] Branch name follows `feat/...`, `fix/...`, etc.
- [ ] PR title is a Conventional Commit.
- [ ] All commits are signed off (`-s`).
- [ ] `pnpm typecheck`, `pnpm test`, and `pnpm lint` pass locally.
- [ ] Docs updated when behavior or APIs change.
- [ ] Changeset entry added if the change affects users (added once
      [changesets](https://github.com/changesets/changesets) is wired up).

## Reporting security issues

Do not open public issues for security problems. Email
[btimurlangit@gmail.com](mailto:btimurlangit@gmail.com) directly.
See [SECURITY.md](SECURITY.md).
