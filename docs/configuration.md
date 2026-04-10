# Configuration

There are **no** repository `.env` files. Configure the product in two ways:

1. **Web UI → Settings** — LLM profiles, API keys, models, and optional Tavily are **persisted in SQLite** and applied to the pipeline when runs execute (`apply_stored_llm_env` in the API before each run).

   **First-run setup** (`/setup`) only requires an admin username and password. You can skip LLM and Tavily during onboarding and add them here (or via environment variables) afterward; the plan step needs a configured LLM and Tavily (or env) when you run jobs.

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

**Settings → LLM** stores **multiple profiles** (OpenAI-compatible and Anthropic) in SQLite as `llm_profiles`, plus **`llm_primary_id`** (exactly one active planner) and **`llm_fallback_ids`** (ordered list of other profile ids). On each pipeline run, **`apply_stored_llm_env`** writes:

- **`CLIPENGINE_LLM_PROFILE_CHAIN_JSON`** — JSON array of resolved profiles (primary first, then fallbacks), including API keys for the worker process.
- Legacy **`LLM_PROVIDER`**, **`OPENAI_*`**, **`ANTHROPIC_*`** — set from the **primary** profile only (CLI / tools that read a single provider still work).

Env-only Docker setups without SQLite can still set **`LLM_PROVIDER`** and a single vendor’s keys; if **`CLIPENGINE_LLM_PROFILE_CHAIN_JSON`** is unset, the planner uses that legacy path.

**Transcription (OpenAI):** When ingest uses **OpenAI** `audio/transcriptions`, **`OPENAI_API_KEY`** / **`OPENAI_BASE_URL`** are set from the **first OpenAI-compatible profile in the chain that has an API key** (which may differ from the primary planner if the primary is Anthropic).

`TAVILY_API_KEY` — same as in the Settings UI; optional if everything is stored in SQLite.

## Web search (plan step)

The plan step uses a **main** provider and an optional **fallback** (environment or **Settings → Search** in the Web UI, stored in SQLite). Fallback runs if the main provider errors or returns no text.

| Variable | Meaning |
|----------|---------|
| `SEARCH_PROVIDER_MAIN` | Primary provider id (`tavily`, `brave`, `duckduckgo`, …), `auto` (first configured key), or `none` / `off`. |
| `SEARCH_PROVIDER_FALLBACK` | Second provider id, or `none`. Not `auto`. |
| `SEARCH_PROVIDER` | Legacy single selector; used only if `SEARCH_PROVIDER_MAIN` is unset. Prefer `SEARCH_PROVIDER_MAIN`. |
| `DUCKDUCKGO_BACKEND` | `auto` (default): Instant Answer API, then optional `duckduckgo-search` if empty; `instant` / `package`. |
| `BRAVE_API_KEY` | Brave Search API subscription token. Alias: **`BRAVE_SEARCH_API_KEY`**. |
| `BRAVE_SEARCH_COUNTRY` | Optional Brave `country` (ISO-3166 alpha-2). Alias: **`BRAVE_COUNTRY`**. |

Other provider keys match the engine (`TAVILY_API_KEY`, `EXA_API_KEY`, `SEARXNG_BASE_URL`, …). **Settings → Search** writes the same names into SQLite; `apply_stored_llm_env` (before each pipeline run) overlays them onto the process environment.

Set **`SEARCH_PROVIDER_MAIN=duckduckgo`** (and no key) for the free **DuckDuckGo Instant Answer** JSON API. For broader snippets, install **`pip install 'clipengine[search]'`** or use a paid provider as main/fallback.

## Pipeline tuning (`clipengine`)

Optional duration and snap tuning (seconds):

- `clipengine_LONGFORM_MIN_S`, `clipengine_LONGFORM_MAX_S`
- `clipengine_SHORTFORM_MIN_S`, `clipengine_SHORTFORM_MAX_S`
- `clipengine_SNAP_DURATION_SLACK_S`

Defaults are defined in `src/clipengine/config.py` and segment snapping helpers under `src/clipengine/plan/`.
