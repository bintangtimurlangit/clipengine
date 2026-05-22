# Self-host with Docker

`docker compose up` is the supported install. Two containers (web,
api), two named volumes (data, workspace), one host port.

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- A host with at least 2 GB of free RAM and a few tens of GB of disk
  for the workspace volume
- Optional: an HTTPS reverse proxy (Caddy, nginx, Traefik, Cloudflare
  Tunnel) — the containers themselves do plain HTTP

## Quick start

```bash
git clone https://github.com/bintangtimurlangit/clipengine.git
cd clipengine
cp deploy/.env.example deploy/.env

# Generate a session secret
echo "CLIPENGINE_AUTH_SECRET=$(openssl rand -hex 32)" >> deploy/.env

docker compose -f deploy/compose.yaml --env-file deploy/.env up -d
```

Open http://localhost:3000 and walk through the registration +
onboarding flow.

## Environment variables

The compose file reads these from `deploy/.env`:

| Variable | Required | Default | Notes |
|---|---|---|---|
| `CLIPENGINE_AUTH_SECRET` | yes | — | `openssl rand -hex 32`. Don't lose this; sessions die if it changes. |
| `CLIPENGINE_PUBLIC_URL` | yes | `http://localhost:3000` | Used for cookies and CORS. Set to your HTTPS URL behind a proxy. |
| `CORS_ORIGINS` | yes | `http://localhost:3000` | Comma-separated list of origins allowed to call the API. |
| `CLIPENGINE_HOST_PORT` | no | `3000` | Host port that maps to the web container. |

The api container also accepts `HOST` and `PORT` if you need to run on
something other than `0.0.0.0:8000`.

## Volumes

The compose file declares two named volumes:

- `data` mounted at `/data` — SQLite database, logo files, upload
  staging.
- `workspace` mounted at `/workspace` — per-run media and rendered
  artifacts.

Back both up. Anything ClipEngine knows about lives there.

## Healthchecks

Both containers expose `HEALTHCHECK` directives. Compose v2 surfaces
these in `docker compose ps`. Internally:

- `api` polls `GET /health`
- `web` polls `GET /` and only fails on a 5xx response

## Logs

```bash
docker compose -f deploy/compose.yaml logs -f api
docker compose -f deploy/compose.yaml logs -f web
```

Worker activity (per run) is also streamed over `GET
/api/runs/:id/stream` and rendered live in the run detail page.

## Updating

```bash
git pull
docker compose -f deploy/compose.yaml pull   # if you use prebuilt GHCR images
docker compose -f deploy/compose.yaml up -d --build
```

Migrations apply on boot; keep `data` mounted across upgrades.

## Reverse proxy

A minimal Caddyfile:

```
clipengine.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

For nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name clipengine.example.com;

    ssl_certificate     /etc/letsencrypt/live/clipengine.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/clipengine.example.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;

        # SSE for run streams
        proxy_read_timeout 24h;
        proxy_buffering    off;
    }
}
```

Don't expose the api container directly to the public internet — keep
it on the docker network and let nginx / Caddy talk to the web
container only.

## Local Whisper notes

The api image installs `cmake`, `g++`, `git`, and `python3` so
`nodejs-whisper` can compile whisper.cpp on the first ingest that uses
the local backend. This adds 30–90 seconds the first time and pulls
~1 GB into the image cache.

Subsequent runs skip the build step entirely. Models download into
the same image cache; switch the active model in
**Settings → Transcription** to pull a different one.

## Where to next

- [Bare-metal install](bare-metal.md)
- [Environment variables reference](env-vars.md)
- [Backup & restore](backup-restore.md)
- [Reverse proxy + TLS](reverse-proxy.md)
