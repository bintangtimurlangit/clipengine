# Configuration

There are **no** repository `.env` files. Configure the product in two ways:

1. **Web UI → Settings** — LLM provider, API keys, models, and optional Tavily are **persisted in SQLite** and applied to the pipeline when runs execute (`clipengine_api.services.engine_env`).

2. **Process environment** (optional) — For Docker, use **`environment:`** in **`docker-compose.yml`** or **`docker-compose.dev.yml`** (or your orchestrator’s secret injection). For local dev, export variables in your shell before starting **uvicorn** / **`npm run dev`**. The API and `clipengine` read standard names below; **Settings** overrides empty/missing values for LLM fields when saved.

## API / deployment

| Variable | Default (Docker) | Meaning |
|----------|------------------|---------|
| `CLIPENGINE_DATA_DIR` | `/data` | SQLite and app state directory |
| `CLIPENGINE_WORKSPACE` | `/workspace` | Run folders (uploads, artifacts) |
| `CLIPENGINE_IMPORT_ROOTS` | *(empty)* | Comma-separated paths inside the container for directory import |
| `CLIPENGINE_PUBLIC_URL` | *(derived from request)* | Public base URL for Google OAuth redirect; set behind reverse proxies |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed browser origins |
| `HOST` | `0.0.0.0` | uvicorn bind (local / non-Docker) |
| `PORT` | `8000` | uvicorn port |

**Output integrations (Settings UI):**

**Portable “anywhere” outputs (recommended for VPS and cloud):**

- **On-disk workspace** — default; files stay under `CLIPENGINE_WORKSPACE` (no OAuth or cloud keys in Settings).
- **Google Drive** — your Google Cloud OAuth client. Redirect URI: `{CLIPENGINE_PUBLIC_URL}/api/google-drive/callback`. Scopes include read + `drive.file` for uploads; reconnect OAuth after scope changes.
- **S3** — access key + secret + bucket + region (+ optional endpoint for S3-compatible APIs) stored in SQLite.
- **Local path (bind mount)** — the UI **cannot** create Docker bind mounts; you add `volumes:` in Compose (or `docker run -v …`) so the API container sees a host directory. **Settings → Storage → Local path** registers **container** absolute paths (they must exist when saving). Those paths merge with **`CLIPENGINE_IMPORT_ROOTS`** (see table above) and the workspace for **import** and **local bind** output. **Tutorial:** **[docs/bind-mounts.md](bind-mounts.md)** and in-app **Help → Bind mounts & local folders**.

**SMB (optional, LAN / trusted networks only):**

- **SMB** — host, share, optional path under the share, username/password. The API process must reach **TCP 445** on the file server.
- **Do not** expose SMB (**port 445**) to the public internet. Use SMB only on a **private LAN**, or over a **VPN / tailnet** (e.g. Tailscale) where the NAS is reachable only on private addresses.
- For a **remote NAS** from a VPS, prefer **Tailscale (or another VPN) + mount the share on the host** (or use **S3** / **Drive**), then point Clip Engine at **import roots** or **workspace** paths—no in-app SMB required.

## Next.js (`apps/web`)

| Variable | Meaning |
|----------|---------|
| `API_INTERNAL_URL` | Server-side fetch + `/api-engine` proxy target (Compose sets `http://api:8000`; local dev: `http://127.0.0.1:8000`) |
| `NEXT_PUBLIC_API_URL` | Optional: browser calls API directly instead of the proxy |

## LLM and Tavily (also in Settings)

`LLM_PROVIDER`, `OPENAI_*`, `ANTHROPIC_*`, `TAVILY_API_KEY` — same names as in the Settings UI; optional if everything is stored in SQLite.

## Transcription (ingest)

| Variable | Meaning |
|----------|---------|
| `CLIPENGINE_TRANSCRIPTION_BACKEND` | `local` (default) or `openai_api`. Same choice is saved in SQLite as `transcription_backend` (**Settings → Transcription**). |

**Local:** faster-whisper with the **tiny** model on the API host (GPU when available). **OpenAI API:** uses `OPENAI_API_KEY` and optional `OPENAI_BASE_URL` (same as **LLM → OpenAI-compatible**). Long WAVs are split into chunks under the API upload size limit.

## Pipeline tuning (`clipengine`)

Optional duration and snap tuning (seconds):

- `clipengine_LONGFORM_MIN_S`, `clipengine_LONGFORM_MAX_S`
- `clipengine_SHORTFORM_MIN_S`, `clipengine_SHORTFORM_MAX_S`
- `clipengine_SNAP_DURATION_SLACK_S`

Defaults are defined in `src/clipengine/llm.py` and `segment_snap.py`.
