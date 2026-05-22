# Environment variables

Every environment variable ClipEngine reads, what it does, and where
it's set.

## API process

| Variable | Default | Purpose |
|---|---|---|
| `HOST` | `0.0.0.0` | Listen interface for the Hono server. |
| `PORT` | `8000` | Listen port. |
| `NODE_ENV` | `development` | `production` flips Better Auth into secure-cookie mode. |
| `CLIPENGINE_DATA_DIR` | `./.clipengine-data` | Holds the SQLite file, logos, and upload staging. Mount as a volume in Docker. |
| `CLIPENGINE_WORKSPACE` | `./.clipengine-workspace` | Per-run media + artifacts. Mount as a volume. |
| `CLIPENGINE_PUBLIC_URL` | `http://localhost:3000` | Public URL the browser uses. Used for cookie scope and CORS. |
| `CLIPENGINE_AUTH_SECRET` | (none) | Required in production. `openssl rand -hex 32`. Better Auth signs session cookies with it. |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed browser origins. |

## Web process

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Next.js bind port. |
| `API_INTERNAL_URL` | `http://127.0.0.1:8000` | Where `/api-engine/*` rewrites send requests. In Docker compose this is `http://api:8000`. |
| `NEXT_TELEMETRY_DISABLED` | (off) | Set to `1` to disable Next.js telemetry. |

## Compose-only

The compose file accepts a few extra:

| Variable | Default | Purpose |
|---|---|---|
| `CLIPENGINE_HOST_PORT` | `3000` | Host port mapped to the web container. |

## What's NOT in the environment

LLM keys, transcription keys, search keys, worker concurrency, presets,
and logos are stored in SQLite via the Settings UI and the `settings`
table. Nothing about how a user clips lives in env vars.

This is deliberate: env vars are for deployment, settings are for
behavior. See [configuration/llm-providers.md](../configuration/llm-providers.md).
