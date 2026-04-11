# Security

Thank you for helping keep Clip Engine and its users safe. This document describes how to report vulnerabilities and what to expect from the project’s security model.

## Reporting a vulnerability

**Please do not open a public issue** for undisclosed security problems.

- **Preferred:** Use [GitHub private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) on [bintangtimurlangit/clipengine](https://github.com/bintangtimurlangit/clipengine), if enabled for the repository.
- Include: affected version or commit, steps to reproduce, impact, and any suggested fix if you have one.

We aim to acknowledge reports within a few business days and to coordinate disclosure after a fix is available.

## Scope

**In scope:** Security issues in this repository that affect Clip Engine when used as documented—for example authentication/session handling in the API, unsafe path handling, injection in pipeline or API inputs, or unintended exposure of secrets or data between runs.

**Out of scope or lower priority unless clearly exploitable through Clip Engine:**

- Issues in upstream dependencies (report to the upstream project; we still appreciate a heads-up if it affects our default install path).
- Denial-of-service from processing very large files or long jobs without resource limits (document operational mitigations where relevant).
- Compliance with third-party terms (e.g. video platforms); users remain responsible for lawful use.

## Product security model (summary)

Clip Engine is designed primarily for **self-hosted / homelab** use:

- The Web UI uses a **single admin account** (bcrypt-hashed password in SQLite). There is **no multi-user isolation**; anyone who can reach the UI and authenticate has full access to settings, imports, and runs.
- **LLM, Tavily, cloud, and OAuth-related credentials** may be stored in **SQLite** via Settings, or supplied via the process environment. Protect the data directory and backups accordingly.
- **Path and import restrictions** (workspace, `CLIPENGINE_IMPORT_ROOTS`, bind mounts) exist to limit where the engine reads and writes; misconfiguration can widen exposure—see [docs/bind-mounts.md](docs/bind-mounts.md) and [docs/configuration.md](docs/configuration.md).
- **Docker socket (`CLIPENGINE_USE_DOCKER_WORKERS`):** When enabled, the **`api`** container can start **sibling containers** on the Docker host via **`/var/run/docker.sock`**. That increases privilege: compromise of **`api`** could affect other containers or the host. Enable only in **trusted** / homelab environments; see [docs/docker.md](docs/docker.md).
- For internet-facing deployments, run behind a **reverse proxy with TLS** and **network access control**; do not rely on the app alone for perimeter security.

More context: [docs/architecture.md](docs/architecture.md) (security notes), [docs/configuration.md](docs/configuration.md) (environment variables and integrations).

## Secure deployment tips

- Restrict who can reach the API and web ports; use firewall rules or private networks.
- Prefer **secrets injection** (e.g. orchestrator secrets, Docker secrets) for API keys over committing values or baking them into images.
- **Backup and encrypt** volumes that hold `CLIPENGINE_DATA_DIR` (SQLite) and `CLIPENGINE_WORKSPACE` if they contain sensitive media or credentials.
- For **SMB** and similar integrations, follow [docs/configuration.md](docs/configuration.md): use private LANs or VPNs; avoid exposing SMB to the public internet.

## Supported versions

Security fixes are applied on the active development branch (typically `dev` / `main` as used in this repo) and tagged releases when applicable. If you need a fix backported, say so in your report.

---

This policy may be updated as the project evolves. Last substantive review: **April 2026**.
