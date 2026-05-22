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

### Removed
- Legacy v1 Python codebase (FastAPI + `clipengine` library, Next.js
  catalog/automation/integrations). v2 is a clean-slate TypeScript
  rewrite.

[Unreleased]: https://github.com/bintangtimurlangit/clipengine/compare/main...dev
