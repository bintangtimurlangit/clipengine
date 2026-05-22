# Security policy

## Reporting a vulnerability

If you find a security issue in ClipEngine, **do not** open a public
GitHub issue. Email the maintainer directly:

> [btimurlangit@gmail.com](mailto:btimurlangit@gmail.com)

Include:

- A description of the issue.
- Steps to reproduce.
- The affected component(s) and version.
- Any proof-of-concept code or logs (please redact secrets).

You should expect an acknowledgment within five business days. We aim
to provide a fix or mitigation within 30 days for high-severity issues
and disclose responsibly after a fix is available.

## Scope

In scope:

- The ClipEngine codebase under this repository.
- Default Docker images we publish.
- The default API and web behavior under a vanilla self-host.

Out of scope:

- Vulnerabilities in third-party services you configure (OpenAI,
  Anthropic, Tavily, Brave, Minimax, custom endpoints).
- Vulnerabilities in third-party software we depend on; please report
  those upstream.
- Misconfigurations introduced by an operator after deployment
  (exposing the admin port, weak passwords, missing TLS, etc.).

## Hardening recommendations

For self-hosters:

- Run ClipEngine behind a reverse proxy with TLS (Caddy, nginx,
  Traefik, Cloudflare Tunnel).
- Use a long, unique admin password; rotate API keys periodically.
- Restrict the admin UI to a private network or VPN where possible.
- Keep the host OS, Docker, and ClipEngine images up to date.
- Back up the data volume (SQLite + workspace) on a regular schedule.

See [`docs/self-host/`](docs/self-host/) for details.
