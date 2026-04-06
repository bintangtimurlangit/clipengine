# Docker (homelab Web UI)

Clip Engine’s Docker story targets **self-hosted** use (desktop, NAS, home server): **no** managed cloud services or SaaS assumptions.

There are **two** Compose files:

| File | Use case | Command |
|------|----------|---------|
| **[`docker-compose.yml`](../docker-compose.yml)** | **Production** — baked Next image, no source mounts; what most people run | `docker compose up --build` |
| **[`docker-compose.dev.yml`](../docker-compose.dev.yml)** | **Development** — hot reload (`next dev`, `uvicorn --reload`) | `docker compose -f docker-compose.dev.yml up --build` |

**Mount extra host folders** (e.g. `E:\Media` → `/mnt/media` in the API container), then allowlist the **container** path in the Web UI: see **[bind-mounts.md](bind-mounts.md)**.

## Production — [`docker-compose.yml`](../docker-compose.yml)

Default stack for running Clip Engine from images (no live code editing):

```bash
docker compose up --build
```

| Piece | Behavior |
|-------|----------|
| **`api`** | Built from **`docker/api.Dockerfile`**. **No** repo bind-mount, **no** `--reload`. Data under named volumes only. **`api`** is not published on the host by default (`expose` only). |
| **`web`** | Built from **`docker/web.Dockerfile`** — Next **standalone** production server. Publishes **3000** on the host. |

Use this for homelab installs and anyone who just wants the app.

## Development — [`docker-compose.dev.yml`](../docker-compose.dev.yml)

For working on **`apps/web`**, **`apps/api`**, or **`src/clipengine`** with auto-reload:

```bash
docker compose -f docker-compose.dev.yml up --build
```

| Piece | Behavior |
|-------|----------|
| **`api`** | Bind-mounts the **repo** to `/app`, **`uvicorn --reload`**. Publishes **8000** on the host. |
| **`web`** | **`node:22-alpine`**, bind-mounts **`apps/web`**, **`next dev --webpack`**, **`WATCHPACK_POLLING`**. Publishes **3000** on the host. |

The **web** app proxies API calls via **`/api-engine/*`** to **`http://api:8000`**, so you only need **http://localhost:3000** in the browser.

## Volumes

| Volume | Used by | Contents |
|--------|---------|----------|
| **`clipengine_data`** | **`api`** (both stacks) | SQLite (`clipengine.db`) |
| **`clipengine_workspace`** | **`api`** (both stacks) | Uploads, transcripts, renders |
| **`web_node_modules`** | **`web`** (**development** only) | Isolates Node deps from the host |

## Environment variables

There is **no** `env_file` or repo **`.env`**. Compose sets **`CLIPENGINE_*`**, **`CORS_ORIGINS`**, and **`API_INTERNAL_URL`** via **`environment:`**. Configure **LLM keys** in the Web UI (**Settings**), persisted in SQLite.

Optional variables are listed in **[configuration.md](configuration.md)**.

### `web`

| Variable | Meaning |
|----------|---------|
| **`API_INTERNAL_URL`** | Target for **`/api-engine`** proxy (default **`http://api:8000`**) |

For **production** `web`, **`API_INTERNAL_URL`** is baked at **build** time in `docker/web.Dockerfile` as well as set at runtime in Compose.

## First run

**Production:** `docker compose up --build` → **http://localhost:3000**

**Development:** `docker compose -f docker-compose.dev.yml up --build` → **http://localhost:3000**

Complete **Setup** if needed (admin account, LLM provider and keys, Tavily key—or the same keys via environment variables). You can adjust keys later under **`/settings`**.

## Ports (host)

| Host port | Service | Notes |
|-----------|---------|--------|
| **3000** | **`web`** | Normal browser entry |
| **8000** | **`api`** | Published in **development** only; in **production**, use the **`web`** proxy or add ports in your own override |

## Optional: GPU for Whisper (v1)

Whisper runs in the **`api`** container. For NVIDIA GPU, install the NVIDIA Container Toolkit and add a GPU reservation to **`api`** (see NVIDIA’s Compose docs).

## Future: dedicated Whisper worker + queue

A future layout may add a **`worker`** service, a **queue**, and shared **`clipengine_workspace`**—not in the current Compose file.
