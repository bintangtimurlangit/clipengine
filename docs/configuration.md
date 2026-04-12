# Configuration

There are **no** repository `.env` files. Configure the product in two ways:

1. **Web UI → Settings** — LLM profiles, API keys, models, and optional Tavily are **persisted in SQLite** and applied to the pipeline when runs execute (`apply_stored_llm_env` at the start of each run in the **API process** or in an **ephemeral worker** process — same database file).

   **First-run setup** (`/setup`) only requires an admin username and password. You can skip LLM and Tavily during onboarding and add them here (or via environment variables) afterward; the plan step needs a configured LLM and Tavily (or env) when you run jobs.

2. **Process environment** (optional) — For Docker, use **`environment:`** in **`docker-compose.yml`** or **`docker-compose.dev.yml`** (or your orchestrator’s secret injection). For local dev, export variables in your shell before starting **uvicorn** / **`npm run dev`**. The API and `clipengine` read standard names below; **Settings** overrides empty/missing values for LLM fields when saved.

## API / deployment

| Variable | Default (Docker) | Meaning |
|----------|------------------|---------|
| `CLIPENGINE_DATA_DIR` | `/data` | SQLite and app state directory |
| `CLIPENGINE_WORKSPACE` | `/workspace` | Run folders (uploads, artifacts) |
| `CLIPENGINE_IMPORT_ROOTS` | *(empty)* | Comma-separated paths inside the container for directory import (merged with **Settings → Storage → Local path** and the workspace for allowlisting) |
| `CLIPENGINE_PUBLIC_URL` | *(derived from request)* | Public base URL for Google OAuth redirect; set behind reverse proxies |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed browser origins |
| `CLIPENGINE_USE_DOCKER_WORKERS` | `false` | If `true`, the API spawns an ephemeral **`clipengine-worker`** container per run (requires Docker socket on **`api`** and a built worker image). See **[docker.md](docker.md)**. |
| `CLIPENGINE_WORKER_IMAGE` | `clipengine-worker:latest` | Image used for pipeline workers. |
| `CLIPENGINE_DOCKER_VOLUME_DATA` | `clipengine_data` | Host Docker volume name mounted to **`CLIPENGINE_DATA_DIR`** in workers (must match Compose). |
| `CLIPENGINE_DOCKER_VOLUME_WORKSPACE` | `clipengine_workspace` | Host Docker volume name for **`CLIPENGINE_WORKSPACE`** in workers. |
| `CLIPENGINE_WORKER_GPUS` | *(empty)* | If set (e.g. `all`), workers are started with `docker run --gpus …` for local Whisper. Leave empty on CPU-only hosts. |
| `CLIPENGINE_WORKER_DOCKER_RUN_ARGS` | *(empty)* | Extra `docker run` arguments (shell-split), e.g. extra `-v` binds so workers see the same paths as **`api`**. |
| `HOST` | `0.0.0.0` | uvicorn bind (local / non-Docker) |
| `PORT` | `8000` | uvicorn port |

### YouTube Live capture

Live and VOD download both use **`yt-dlp`** in the **API** process. Subprocesses are tracked so **cancel** can **SIGTERM** them.

| Variable | Default | Meaning |
|----------|---------|---------|
| `CLIPENGINE_LIVE_MAX_SECONDS` | `7200` | Hard cap on live recording length (60–86400); timer sends SIGTERM to yt-dlp. |
| `CLIPENGINE_LIVE_MIN_BYTES` | `262144` | Minimum output size (bytes) before a run is promoted to **`ready`** after capture. |
| `CLIPENGINE_LIVE_YTDLP_EXTRA_ARGS` | *(empty)* | Extra arguments (shell-split) appended before the URL for **`youtube_live`** only (e.g. format tweaks). |
| `CLIPENGINE_YTDLP_EXTRA_ARGS` | *(empty)* | Extra arguments for **VOD** `youtube_url` fetch only. |

See **[youtube-live.md](youtube-live.md)** for behavior and limitations.

### Import and catalog (API)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/import/roots`, `GET /api/import/videos` | Allowlisted directories and recursive video listing |
| `GET /api/s3/browse` | Read-only S3 prefix listing (same credentials as S3 output) |
| `POST /api/runs` | `source_type`: `upload`, `youtube_url`, `youtube_live`, `local_path`, `google_drive`, `s3_object`; optional `planning_context` |
| `POST /api/runs/{id}/live/stop` | End **YouTube Live** capture (SIGTERM yt-dlp); run becomes **`ready`** when media validates |
| `POST /api/runs/batch` | Multiple `local_path`; optional `root_prefix` + `use_relative_path_as_planning_context` |
| `POST /api/runs/from-catalog` | Create a run from a catalog row (materialize then pipeline) |
| `POST /api/catalog/sync`, `GET /api/catalog/entries` | Index media metadata; does not run the pipeline by itself |

**SQLite and workers:** With **`CLIPENGINE_USE_DOCKER_WORKERS`**, the **`api`** process and each **worker** process both open the same database file on **`CLIPENGINE_DATA_DIR`**. The app uses SQLite **WAL** mode for safer concurrent access; workers and the API coordinate run status via normal SQL updates (including an atomic **`ready` → `running`** claim when a Docker worker starts).

**Output integrations (Settings UI):**

**Portable “anywhere” outputs (recommended for VPS and cloud):**

- **On-disk workspace** — default; files stay under `CLIPENGINE_WORKSPACE` (no OAuth or cloud keys in Settings).
- **Google Drive** — your Google Cloud OAuth client. Redirect URI: `{CLIPENGINE_PUBLIC_URL}/api/google-drive/callback`. Scopes include read + `drive.file` for uploads; reconnect OAuth after scope changes.
- **S3** — access key + secret + bucket + region (+ optional endpoint for S3-compatible APIs) stored in SQLite.
- **Local path (bind mount)** — the UI **cannot** create Docker bind mounts; you add `volumes:` in Compose (or `docker run -v …`) so the API container sees a host directory. **Settings → Storage → Local path** registers **container** absolute paths (they must exist when saving). Those paths merge with **`CLIPENGINE_IMPORT_ROOTS`** (see table above) and the workspace for **import** and **local bind** output. **Tutorial:** **[docs/bind-mounts.md](bind-mounts.md)** and in-app **Help → Bind mounts & local folders**.

### YouTube upload

- **BYOC OAuth** — create a **Web application** OAuth client in Google Cloud, enable **YouTube Data API v3**, and add redirect URI `{CLIPENGINE_PUBLIC_URL}/api/youtube/callback` (same pattern as Drive).
- **Multiple Google accounts** — use **Add account (browser)** in **Settings → YouTube** so each Google user authorizes once; the server stores one refresh token per account and shows channel titles when possible (requires `youtube.readonly` scope on new connections).
- **Quota** — daily **YouTube Data API** quota is **per Google Cloud project** (your OAuth client), not per channel. Extra channels do **not** increase upload quota.
- **Per-run distribution** — on the run page, when output is **YouTube**, choose how rendered MP4s map to selected channels: single channel, random per clip, round-robin, one random channel for the entire run, or **broadcast** (upload a copy of each clip to every selected channel; uses more quota).

**SMB (optional, LAN / trusted networks only):**

- **SMB** — host, share, optional path under the share, username/password. The API process must reach **TCP 445** on the file server.
- **Do not** expose SMB (**port 445**) to the public internet. Use SMB only on a **private LAN**, or over a **VPN / tailnet** (e.g. Tailscale) where the NAS is reachable only on private addresses.
- For a **remote NAS** from a VPS, prefer **Tailscale (or another VPN) + mount the share on the host** (or use **S3** / **Drive**), then point Clip Engine at **import roots** or **workspace** paths—no in-app SMB required.

## Next.js (`apps/web`)

| Variable | Meaning |
|----------|---------|
| `API_INTERNAL_URL` | Server-side fetch + `/api-engine` proxy target (Compose sets `http://api:8000`; local dev: `http://127.0.0.1:8000`) |
| `NEXT_PUBLIC_API_URL` | Optional: browser calls API directly instead of the proxy. When set, the run detail page uses a **WebSocket** to `/api/runs/{id}/live` for live log pushes (otherwise it polls HTTP ~1s). Use a URL reachable from the browser (e.g. `http://127.0.0.1:8000`, not a Docker-only hostname). |

## LLM and Tavily (also in Settings)

**Settings → LLM** stores **multiple profiles** (OpenAI-compatible and Anthropic) in SQLite as `llm_profiles`, plus **`llm_primary_id`** (exactly one active planner) and **`llm_fallback_ids`** (ordered list of other profile ids). On each pipeline run, **`apply_stored_llm_env`** writes:

- **`CLIPENGINE_LLM_PROFILE_CHAIN_JSON`** — JSON array of resolved profiles (primary first, then fallbacks), including API keys for the worker process.
- Legacy **`LLM_PROVIDER`**, **`OPENAI_*`**, **`ANTHROPIC_*`** — set from the **primary** profile only (CLI / tools that read a single provider still work).

Env-only Docker setups without SQLite can still set **`LLM_PROVIDER`** and a single vendor’s keys; if **`CLIPENGINE_LLM_PROFILE_CHAIN_JSON`** is unset, the planner uses that legacy path.

**Transcription (OpenAI):** When ingest uses **OpenAI** `audio/transcriptions`, **`OPENAI_API_KEY`** / **`OPENAI_BASE_URL`** are set from the **first OpenAI-compatible profile in the chain that has an API key** (which may differ from the primary planner if the primary is Anthropic).

**Transcription (AssemblyAI):** When ingest uses **AssemblyAI**, set **`ASSEMBLYAI_API_KEY`** (and optionally **`ASSEMBLYAI_BASE_URL`**, e.g. `https://api.eu.assemblyai.com` for EU). The Settings UI stores these in SQLite like other API keys.

`TAVILY_API_KEY` — same as in the Settings UI; optional if everything is stored in SQLite.

## Web search (plan step)

The plan step uses a **main** provider and an optional **fallback** (environment or **Settings → Search** in the Web UI, stored in SQLite). Fallback runs if the main provider errors or returns no text.

| Variable | Meaning |
|----------|---------|
| `SEARCH_PROVIDER_MAIN` | Primary provider id (`tavily`, `brave`, `duckduckgo`, …), `auto` (first API-backed provider with key, else **DuckDuckGo**), or `none` / `off`. |
| `SEARCH_PROVIDER_FALLBACK` | Second provider id, or `none`. Not `auto`. |
| `SEARCH_PROVIDER` | Legacy single selector; used only if `SEARCH_PROVIDER_MAIN` is unset. Prefer `SEARCH_PROVIDER_MAIN`. |
| `DUCKDUCKGO_REGION` | DuckDuckGo region code for HTML search (default `us-en`; e.g. `uk-en`, `de-de`). |
| `DUCKDUCKGO_SAFE_SEARCH` | `strict`, `moderate` (default), or `off`. |
| `DUCKDUCKGO_TEXT_BACKEND` | Passed to `duckduckgo-search` as `backend` (default `auto`; use `html` to force HTML scraping). |
| `DUCKDUCKGO_CLIENT_TIMEOUT` | Seconds (default `25`) for the `duckduckgo-search` HTTP client. Alias: `DUCKDUCKGO_PACKAGE_CLIENT_TIMEOUT`. |
| `DUCKDUCKGO_WALL_TIMEOUT` | Seconds (default `45`) hard cap for a full DuckDuckGo search (prevents hangs). Alias: `DUCKDUCKGO_PACKAGE_WALL_TIMEOUT`. |
| `DUCKDUCKGO_BACKEND` | Legacy; no longer used by the engine (HTML search only). |
| `BRAVE_API_KEY` | Brave Search API subscription token. Alias: **`BRAVE_SEARCH_API_KEY`**. |
| `BRAVE_SEARCH_COUNTRY` | Optional Brave `country` (ISO-3166 alpha-2). Alias: **`BRAVE_COUNTRY`**. |

Other provider keys match the engine (`TAVILY_API_KEY`, `EXA_API_KEY`, `SEARXNG_BASE_URL`, …). **Settings → Search** writes the same names into SQLite; `apply_stored_llm_env` (before each pipeline run) overlays them onto the process environment.

**DuckDuckGo** is bundled (no API key): it uses the **unofficial** HTML search path via `duckduckgo-search` (same idea as [OpenClaw’s DuckDuckGo integration](https://docs.openclaw.ai/tools/duckduckgo-search)), not DuckDuckGo’s Instant Answer JSON endpoint. With **main** set to **`auto`** and no other provider keys, the engine defaults to **DuckDuckGo**. For production-grade reliability, consider Tavily, Brave, or another API-backed provider as main.

## Pipeline tuning (`clipengine`)

Optional duration and snap tuning (seconds):

- `clipengine_LONGFORM_MIN_S`, `clipengine_LONGFORM_MAX_S`
- `clipengine_SHORTFORM_MIN_S`, `clipengine_SHORTFORM_MAX_S`
- `clipengine_SNAP_DURATION_SLACK_S`

Defaults are defined in `src/clipengine/config.py` and segment snapping helpers under `src/clipengine/plan/`.

## Subtitles (SQLite settings)

Burned-in subtitles are configured under **Settings → Subtitles** and stored in the same SQLite JSON blob as other instance settings. Keys (snake_case in storage; the HTTP API uses camelCase in `GET /api/settings`):

| Key | Meaning |
|-----|--------|
| `subtitles_enabled` | Master switch: when `true`, render burns transcript text onto each clip (requires `transcript.json` after ingest). |
| `subtitles_font_family` | Font family name (Fontconfig / libass; the worker image includes **DejaVu** fonts). |
| `subtitles_font_size` | Font size in pixels (relative to output resolution). |
| `subtitles_primary_color`, `subtitles_outline_color` | Colors as `#RRGGBB` or `#RRGGBBAA`. |
| `subtitles_outline_width` | Outline thickness (0–20). |
| `subtitles_margin_v` | Bottom/top margin in pixels (0–400), depending on alignment. |
| `subtitles_alignment` | One of: `bottom_left`, `bottom_center`, `bottom_right`, `middle_left`, `middle_center`, `middle_right`, `top_left`, `top_center`, `top_right`. |
| `subtitles_max_lines` | Max wrapped lines per subtitle cue (1–8). |

**Per run:** `POST /api/runs/{id}/start` accepts `subtitles_disabled: true`. The API stores `subtitlesDisabled: true` in that run’s `extra` JSON so the render step skips burn-in even when global subtitles are on. Omitting the flag or sending `false` clears `subtitlesDisabled` for that run so it follows the global default. New runs do not inherit another run’s opt-out.
