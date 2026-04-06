# Configuration

There are **no** repository `.env` files. Configure the product in two ways:

1. **Web UI → Settings** — LLM provider, API keys, models, optional Tavily, transcription backend, **pipeline duration bounds**, **snap slack**, and **max upload size** are **persisted in SQLite** and applied when runs execute (`clipengine_api.core.env.apply_stored_llm_env`).

2. **Process environment** (optional) — For Docker, use **`environment:`** in **`docker-compose.yml`** or **`docker-compose.dev.yml`** (or your orchestrator’s secret injection). For local dev, export variables in your shell before starting **uvicorn** / **`npm run dev`**. The API and `clipengine` read standard names below; **Settings** overrides empty/missing values for LLM fields when saved.

## API / deployment

| Variable | Default (Docker) | Meaning |
|----------|------------------|---------|
| `CLIPENGINE_DATA_DIR` | `/data` | SQLite and app state directory |
| `CLIPENGINE_WORKSPACE` | `/workspace` | Run folders (uploads, artifacts) |
| `CLIPENGINE_IMPORT_ROOTS` | *(empty)* | Comma-separated paths inside the container for directory import |
| `CLIPENGINE_PUBLIC_URL` | *(derived from request)* | Public base URL for Google OAuth redirects (Drive, YouTube); set behind reverse proxies |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed browser origins |
| `HOST` | `0.0.0.0` | uvicorn bind (local / non-Docker) |
| `PORT` | `8000` | uvicorn port |

**Output integrations (Settings UI):**

**Portable “anywhere” outputs (recommended for VPS and cloud):**

- **On-disk workspace** — default; files stay under `CLIPENGINE_WORKSPACE` (no OAuth or cloud keys in Settings).
- **Google Drive** — your Google Cloud OAuth client. Redirect URI: `{CLIPENGINE_PUBLIC_URL}/api/google-drive/callback`. Scopes include read + `drive.file` for uploads; reconnect OAuth after scope changes.
- **YouTube** — separate OAuth client (or same project with **YouTube Data API v3** enabled). Redirect URI: `{CLIPENGINE_PUBLIC_URL}/api/youtube/callback`. Scope: `youtube.upload`. Default API quota is low (~six full uploads per day at 10,000 units unless you request a quota increase in Google Cloud Console).
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

Optional duration and snap tuning (seconds). Configure under **Settings → Pipeline** in the Web UI (stored in SQLite) or set process environment variables:

- `clipengine_LONGFORM_MIN_S`, `clipengine_LONGFORM_MAX_S`
- `clipengine_SHORTFORM_MIN_S`, `clipengine_SHORTFORM_MAX_S`
- `clipengine_SNAP_DURATION_SLACK_S`

Defaults are defined in [`src/clipengine/config.py`](../src/clipengine/config.py) (durations) and [`src/clipengine/plan/snap.py`](../src/clipengine/plan/snap.py) (snap slack default when unset). Saved Settings values override empty or missing env for each key.

## Upload size (API)

| Variable | Default | Meaning |
|----------|---------|---------|
| `CLIPENGINE_MAX_UPLOAD_BYTES` | `5368709120` (5 GiB) | Maximum size for **browser upload** runs (`POST /api/runs/{id}/upload`). Same value is configurable under **Settings → Pipeline** (stored in SQLite). Valid range: 1 MiB–50 GiB. |

## Telegram notifications (optional)

Configure under **Settings → Notifications** (stored in SQLite) or set process environment variables. When enabled, the API sends a Telegram message when a pipeline run **completes** or **fails** (not when cancelled).

| Variable | Meaning |
|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Bot token from [@BotFather](https://t.me/BotFather). Used if no token is stored in Settings. |
| `TELEGRAM_CHAT_ID` | Destination chat ID. Used if no chat ID is stored in Settings. |
