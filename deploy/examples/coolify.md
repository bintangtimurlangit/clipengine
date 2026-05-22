# Deploying ClipEngine on Coolify

[Coolify](https://coolify.io/) is a self-hosted deployment platform that
runs Docker Compose stacks behind its own reverse proxy. ClipEngine
ships with a ready-to-use compose file at
[`deploy/compose.yaml`](../compose.yaml).

## 1. Create a new resource

In your Coolify dashboard:

1. **+ New Resource → Docker Compose Empty**.
2. Point it at this repository.
3. Set the compose file path to `deploy/compose.yaml`.

## 2. Set the environment variables

Coolify reads env vars from the resource's **Environment** tab, not from
`deploy/.env`. Add at least:

| Variable | Value |
|---|---|
| `CLIPENGINE_PUBLIC_URL` | `https://clipengine.example.com` (your public domain) |
| `CLIPENGINE_AUTH_SECRET` | output of `openssl rand -hex 32` |
| `CORS_ORIGINS` | same as `CLIPENGINE_PUBLIC_URL` |

Optional:

- `CLIPENGINE_HOST_PORT` if 3000 is taken on the host.

## 3. Volumes

The compose file declares two named volumes — `data` (SQLite + logos)
and `workspace` (per-run media + artifacts). Coolify creates them
automatically on first deploy. Back them up regularly; everything
ClipEngine knows about lives there.

## 4. Reverse proxy

Coolify wires its built-in proxy to whichever service exposes port
3000, which is the `web` container. No extra config needed.

## 5. First-run

Open `https://clipengine.example.com` and you'll land on the
registration page. Create the admin account, walk the three-step
onboarding (transcription, LLM, web search), then start clipping.
