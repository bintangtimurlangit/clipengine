# Deploying ClipEngine on Fly.io

ClipEngine maps cleanly to two Fly apps that share a private network:
`clipengine-api` (the Hono backend + worker) and `clipengine-web` (the
Next.js UI). Both pull the same images this repo's
[`compose.yaml`](../compose.yaml) builds.

## Apps

```bash
# API
fly launch --name clipengine-api --image ghcr.io/bintangtimurlangit/clipengine-api:latest --no-deploy

# Web
fly launch --name clipengine-web --image ghcr.io/bintangtimurlangit/clipengine-web:latest --no-deploy
```

Edit `fly.toml` for each.

## clipengine-api/fly.toml

```toml
app = "clipengine-api"
primary_region = "sin"

[build]
  image = "ghcr.io/bintangtimurlangit/clipengine-api:latest"

[env]
  HOST = "0.0.0.0"
  PORT = "8000"
  NODE_ENV = "production"
  CLIPENGINE_DATA_DIR = "/data"
  CLIPENGINE_WORKSPACE = "/workspace"
  CLIPENGINE_PUBLIC_URL = "https://clipengine.example.com"
  CORS_ORIGINS = "https://clipengine.example.com"

[[mounts]]
  source = "clipengine_data"
  destination = "/data"

[[mounts]]
  source = "clipengine_workspace"
  destination = "/workspace"

[http_service]
  internal_port = 8000
  force_https = false
  auto_stop_machines = false
  min_machines_running = 1
```

Set the secret:

```bash
fly secrets set --app clipengine-api CLIPENGINE_AUTH_SECRET=$(openssl rand -hex 32)
fly volumes create clipengine_data --size 5 --app clipengine-api
fly volumes create clipengine_workspace --size 50 --app clipengine-api
fly deploy --app clipengine-api
```

## clipengine-web/fly.toml

```toml
app = "clipengine-web"
primary_region = "sin"

[build]
  image = "ghcr.io/bintangtimurlangit/clipengine-web:latest"

[env]
  NODE_ENV = "production"
  PORT = "3000"
  NEXT_TELEMETRY_DISABLED = "1"
  API_INTERNAL_URL = "http://clipengine-api.internal:8000"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false
  min_machines_running = 1
```

```bash
fly deploy --app clipengine-web
```

The `.internal` hostname uses Fly's private 6PN network so the web
container reaches the API without exposing port 8000 publicly.
