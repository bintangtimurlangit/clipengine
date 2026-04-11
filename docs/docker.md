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
| **`clipengine_data`** | **`api`** (both stacks); **ephemeral workers** (same mounts) | SQLite (`clipengine.db`) |
| **`clipengine_workspace`** | **`api`** (both stacks); **ephemeral workers** (same mounts) | Uploads, transcripts, renders |
| **`web_node_modules`** | **`web`** (**development** only) | Isolates Node deps from the host |

When **`CLIPENGINE_USE_DOCKER_WORKERS`** is enabled, each pipeline run uses **`docker run`** with the same named volumes so workers read and write the same run folders and database as **`api`**.

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

## Optional: ephemeral pipeline workers

When **`CLIPENGINE_USE_DOCKER_WORKERS=true`**, the API **does not** run the heavy pipeline (Whisper + FFmpeg + plan + render) in-process. It starts a short-lived **`clipengine-worker`** container per run (`docker run --rm` semantics via `--rm`), waits for it to exit, then the container is gone. **Idle** behavior stays the same: only **`api`** + **`web`** are long-running services—there is no always-on worker service in Compose. A start is **claimed** in SQLite (`ready` → `running`, step **`queued`**) before the container launches so the same run cannot start twice; **cancel** stops the worker by a deterministic container name.

1. Build the worker image (same Python stack as the API, different entrypoint):

   ```bash
   docker build -f docker/worker.Dockerfile -t clipengine-worker:latest .
   ```

   Or: `docker compose --profile worker build worker` (see **`worker`** service in **`docker-compose.yml`** — profile **`worker`**, image-only build).

2. In Compose, set **`CLIPENGINE_USE_DOCKER_WORKERS: "true"`** on **`api`** and **uncomment** the Docker socket mount:

   ```yaml
   volumes:
     - /var/run/docker.sock:/var/run/docker.sock
   ```

   Mounting the socket lets the API spawn sibling containers on the host. Treat the **`api`** container as **trusted** (homelab-only); do not expose it untrusted to the internet.

3. Optional: **`CLIPENGINE_WORKER_GPUS=all`** (or another `--gpus` value) so the **worker** container gets the GPU for local **faster-whisper**. The **`api`** container does not need a GPU reservation when workers are enabled.

See **[configuration.md](configuration.md)** for **`CLIPENGINE_WORKER_*`** and volume name overrides.

## Optional: GPU for Whisper (in-process mode)

If **`CLIPENGINE_USE_DOCKER_WORKERS`** is **false** (default), Whisper runs in the **`api`** process. For NVIDIA GPU, install the NVIDIA Container Toolkit and add a GPU reservation to **`api`** (see NVIDIA’s Compose docs).

## Future: queue + Redis

A **Redis** (or similar) queue is not in the current Compose file; ephemeral workers cover per-run isolation without an always-on queue.
