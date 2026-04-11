# Bind mounts (host folders in the API container)

Use this when you want Clip Engine to **read** videos from a folder on your machine (or NAS path visible to Docker) or **write** rendered MP4s to such a folder. There are **two separate steps**: Docker wiring, then Web UI allowlisting.

## What does what

| Step | Where | Purpose |
|------|--------|---------|
| **Bind mount** | Docker Compose (or `docker run -v`) | Makes a **host** directory appear at a fixed **path inside the API container** (e.g. host `E:\Media` → container `/mnt/media`). |
| **Local path (Settings)** | Web UI → **Settings** → **Storage** → **Local path** | Stores **container paths** in SQLite so Clip Engine **allowlists** them for directory import and for **Local path (bind mount)** output. Does **not** change Docker. |

You must do **both**: mount in Docker first, then register the **container** path in Settings.

---

## 1. Add a bind mount in Docker

Edit a Compose file that defines the **`api`** service. Easiest: add **`docker-compose.override.yml`** in the repo root (Compose merges it with **`docker-compose.yml`** for **`docker compose up`**). For **development** (hot reload), pass **`-f docker-compose.dev.yml`** and use the same override with both files (see **Apply** below), or edit a **local** copy of `docker-compose.dev.yml` (do not commit).

### Example: Windows (Docker Desktop)

Mount `E:\Star Wars` so the API sees it as `/mnt/star-wars`:

```yaml
# docker-compose.override.yml (repo root)
services:
  api:
    volumes:
      - E:/Star Wars:/mnt/star-wars:rw
```

Notes:

- Use forward slashes in YAML (`E:/Star Wars`) or quote the path if your tool requires it.
- `:rw` is read-write (needed if you copy renders there). Use `:ro` only if the API should never write.

### Example: Linux / macOS

```yaml
services:
  api:
    volumes:
      - /home/you/Videos:/mnt/videos:rw
```

### Apply the change

Recreate the **`api`** container after changing volumes.

**Production** (default stack):

```bash
docker compose up -d --force-recreate api
```

**Development** (hot reload):

```bash
docker compose -f docker-compose.dev.yml up -d --force-recreate api
```

With **`docker-compose.override.yml`**: for production, `docker compose up` merges **`docker-compose.yml`** + **`docker-compose.override.yml`**. For development, run **`docker compose -f docker-compose.dev.yml -f docker-compose.override.yml up -d --force-recreate api`**.

### Optional: import roots via environment only

You can also list paths in **`CLIPENGINE_IMPORT_ROOTS`** (comma-separated, **container** paths). That merges with **Settings → Local path** and the workspace. See **[configuration.md](configuration.md)**.

---

## 2. Register paths in the Web UI

1. Open **Settings** → **Storage** → **Local path**.
2. Enter **one absolute path per line**, as seen **inside the API container** (e.g. `/mnt/star-wars`).
3. Each path must **already exist** in the container when you click **Save** (so complete the Docker step and restart first).
4. Click **Save paths**.

Those paths are now allowlisted for:

- **Import** → browse videos under registered directories (subject to existing import rules).
- **Catalog** → **Sync local** uses the same allowlisted roots to index metadata before you create runs.
- **Runs** → **Start pipeline** → **Local path (bind mount)** → choose a destination directory under an allowlisted root.

You can also import from **Google Drive** or **S3** (credentials in **Settings**) without bind mounts; see **[pipeline.md](pipeline.md#import-sources)**.

---

## 3. Use it when starting a pipeline

On a run in **Ready** state, under **Output destination**, choose **Local path (bind mount)** and enter a **destination directory** inside the container, e.g. `/mnt/star-wars/exports`. That directory should exist or be creatable under your mount; the app copies `rendered/**/*.mp4` and `rendered/**/*.jpg` under `{destination}/{run id}/rendered/...`.

---

## Troubleshooting

| Problem | What to check |
|--------|----------------|
| **Save** fails in Settings | Path does not exist inside the API container—fix Compose, recreate `api`, verify with `docker exec <api-container> ls /mnt/star-wars`. |
| Import does not list files | Path not allowlisted, or not under merged roots; confirm Settings list and `CLIPENGINE_IMPORT_ROOTS`. |
| Pipeline output fails | Destination not under an allowlisted root; check run error message. |

---

## Why the Web UI does not edit Docker

Changing bind mounts requires the **Docker Engine** (usually via Compose + container **recreation**). The Clip Engine API does **not** mount the Docker socket **by default**, so it cannot add or change host→container mounts from the browser. This keeps the default deployment simpler and safer.

**Ephemeral pipeline workers:** If you enable **`CLIPENGINE_USE_DOCKER_WORKERS`**, the **`api`** container **does** receive the Docker socket so it can start worker containers. That path does **not** add bind mounts automatically: for **local bind** output or imports under extra host paths, give workers the same visibility as **`api`** by repeating mounts via **`CLIPENGINE_WORKER_DOCKER_RUN_ARGS`** (see **[configuration.md](configuration.md)** and **[docker.md](docker.md)**).

See also **[docker.md](docker.md)** for the default Compose stack and **[pipeline.md](pipeline.md)** for output options.
