# Pipeline (ingest → plan → render)

Clip Engine runs the same three stages whether you use the **Web UI** or call the **HTTP API**. There is **no separate terminal CLI** in this repository.

## Stages

| Stage | What happens | Main outputs |
|-------|----------------|--------------|
| **Ingest** | FFmpeg extracts audio; speech-to-text via **local faster-whisper** (fixed **tiny** model), **OpenAI** [`audio/transcriptions`](https://platform.openai.com/docs/guides/speech-to-text) (`whisper-1`), or **[AssemblyAI](https://www.assemblyai.com/docs)** pre-recorded STT, chosen under **Settings → Transcription** | `transcript.json`, `segments.vtt`, `audio_16k_mono.wav` |
| **Plan** | LLM proposes cut windows (**Settings → LLM**: one **primary** profile and optional **ordered fallbacks**; recoverable API errors try the next profile). Optional **web search** via main + fallback providers (**Settings → Search** or `SEARCH_PROVIDER_MAIN` / `SEARCH_PROVIDER_FALLBACK` — see **[configuration.md](configuration.md#web-search-plan-step)**) | `cut_plan.json` (per clip: `title`, `rationale`, `publish_description`, etc.) |
| **Render** | FFmpeg produces longform (16:9) and shortform (9:16) MP4s plus a JPEG thumbnail per clip | `rendered/longform/*.mp4`, `rendered/longform/*.jpg`, `rendered/shortform/*.mp4`, `rendered/shortform/*.jpg` |

Shortform JPEGs are cropped with FFmpeg *cropdetect* so thumbnails omit black padding from the encoded 9:16 frame; longform thumbnails are a full-frame sample.

**Full run:** the dashboard **Start pipeline** action chains all three in one workspace folder (equivalent to the old “run-all” concept).

**Where it runs:** by default the API runs this chain **in-process** (one run at a time via a lock). If **`CLIPENGINE_USE_DOCKER_WORKERS`** is enabled in Docker, each start runs the same stages inside an **ephemeral worker container** that shares the workspace and SQLite volumes; see **[docker.md](docker.md)**. The run row is claimed with **`step: queued`** before the container starts, then moves to **`ingest`** when the worker begins.

**Multi-audio sources:** Files with more than one audio stream (common on MKV and some MOV/WebM) require choosing a track on the run detail page before **Start pipeline**. The same 0-based index is used for **ingest** (WAV extraction / transcription) and **render** (muxed audio in each clip). The API lists streams with `GET /api/runs/{id}/audio-streams` and accepts `audio_stream_index` on `POST /api/runs/{id}/start`. Render applies trim seeks **after** opening the file (decode-time seek) so the chosen audio stream is muxed reliably; input-only seeking can drop or silence non-default tracks on some containers.

If no LLM API key is configured for the selected provider, the UI offers **Configure LLM first** or **Run without LLM**. The latter writes `cut_plan.json` using simple time windows (heuristic plan), then render runs as usual.

**API:** `POST /api/runs/{id}/start` accepts `skip_llm_plan: true` to use the heuristic planner; without it, the API returns **400** when the LLM is not configured.

**Restart:** When a run is **`completed`**, **`failed`**, or **`cancelled`**, you can use **Restart run** on the run detail page. That removes pipeline outputs in the workspace (e.g. `transcript.json`, `cut_plan.json`, `rendered/`, activity logs) and sets the run back to **`ready`** so you can **Start pipeline** again; the **source video file is kept**. **API:** `POST /api/runs/{id}/restart`.

## Output destination (per run)

When you click **Start pipeline**, you choose where **rendered** output goes (independent of where the source video came from).

### Portable “anywhere” (best for VPS / cloud)

| Choice | Behavior |
|--------|----------|
| **Workspace** | Default: keep everything on the server under the run until you delete it. |
| **Google Drive** | After render, **MP4s and JPEG thumbnails under `rendered/`** are uploaded to a **folder** you specify (your own OAuth client in **Settings**; you may need to re-authorize after upgrades that add upload scope). |
| **S3** | After render, MP4s and thumbnails are uploaded to your bucket using **access key credentials** stored in **Settings** (AWS, MinIO, Cloudflare R2, etc.). Default object prefix is `{settings prefix}{run id}/…`; optional per-run prefix overrides that. |
| **Local path (bind mount)** | After render, MP4s and thumbnails are copied under a **directory you choose** inside the container (e.g. `/<mount>/exports`). Mount host folders in Docker first, then **register** those paths in **Settings → Storage → Local path** so they are allowlisted; the run must target a path under that allowlist (or under workspace / `CLIPENGINE_IMPORT_ROOTS`). |
| **YouTube** | After render, **MP4s under `rendered/`** are uploaded with **YouTube Data API v3** using your OAuth client under **Settings → YouTube**. You can connect **multiple** Google accounts and choose how clips are distributed (single channel, random per clip, round-robin, one random channel per run, or upload each clip to every selected channel). Quota is **per Google Cloud project** — see **[configuration.md — YouTube upload](configuration.md#youtube-upload)**. |

### SMB (optional: LAN / trusted network only)

| Choice | Behavior |
|--------|----------|
| **SMB** | After render, MP4s and thumbnails are written to a **Windows/SMB share** using host, share, and credentials in **Settings**. The API must reach **TCP 445** on the file server. |

**Security:** do **not** expose SMB to the **public internet**. Use SMB only on a **private LAN** or over a **VPN / tailnet** (e.g. Tailscale) where the NAS is reachable on private IPs. For remote storage from a VPS, prefer **S3**, **Google Drive**, or **workspace**; or use **VPN + mount** the share on the host and use normal paths instead of in-app SMB.

### Import sources

Clip Engine supports **directory import** (allowlisted paths under the workspace, **`CLIPENGINE_IMPORT_ROOTS`**, and **Settings → Storage → Local path**), **upload**, **URL** (yt-dlp VOD), **YouTube Live** (yt-dlp until stop or max duration — see **[youtube-live.md](youtube-live.md)**), **Google Drive** (OAuth in Settings), **S3** (list and download using credentials in Settings), and a **media catalog** index.

- **Catalog:** `POST /api/catalog/sync` indexes videos from a local root, an S3 prefix, or a Google Drive folder (metadata only). `GET /api/catalog/entries` lists rows; `POST /api/runs/from-catalog` creates a run and **materializes** the file into the run workspace (copy or download) before ingest.
- **Planning context:** Optional **`planningContext`** on the run (`extra` JSON) combines with the run title for the LLM plan step so folder hierarchy (e.g. `Show/Season 1/file.mp4`) can inform cuts. Batch import can set **`use_relative_path_as_planning_context`** with **`root_prefix`** to fill this from relative paths.

**Advanced:** You can still **mount** NFS or a tailnet share on the host and register those paths as import roots—no separate “remote NAS” plugin required. Using **S3** or **Drive** in Settings avoids FUSE/rclone for many deployments.

**Batch / folder listing:** `GET /api/import/videos` accepts `recursive=true` to include videos in subfolders (list size is capped). **`POST /api/runs/batch`** accepts multiple `local_paths`, optional `shuffle`, optional `title_prefix`, optional **`root_prefix`** + **`use_relative_path_as_planning_context`**, creating one run per file (same validation as a single `local_path` import).

## Artifacts (typical run folder)

| Path | Produced by |
|------|----------------|
| `transcript.json` | Ingest |
| `segments.vtt` | Ingest |
| `audio_16k_mono.wav` | Ingest |
| `cut_plan.json` | Plan: each clip has `title`, `rationale` (editorial reasoning), and `publish_description` (short public copy for uploads; **heuristic** plans leave it empty) |
| `llm_activity.log` | Plan (LLM runs only): verbose foundation + cut-plan output for the Web UI terminal |
| `render_activity.json` | Render: written as soon as encode starts (`render_start`: probing source / preparing), then before each clip (`render_clip`), then `render_complete`; the dashboard polls `GET /api/runs/{id}/render-activity` or receives pushes over `WS /api/runs/{id}/live` when `NEXT_PUBLIC_API_URL` is set |
| `rendered/longform/*.mp4` | Render |
| `rendered/longform/*.jpg` | Render (thumbnail for each longform clip) |
| `rendered/shortform/*.mp4` | Render |
| `rendered/shortform/*.jpg` | Render (thumbnail for each shortform clip) |

## Publishing metadata

- **API:** `GET /api/runs/{id}/clips` returns each clip’s plan fields plus **`publishTitle`** and **`publishDescription`**, resolved using **[Settings → Publishing](configuration.md#publishing-sqlite-settings--publishing)** (same rules as YouTube).
- **ZIP:** `GET /api/runs/{id}/artifacts/render-zip?path=…` includes `publish.txt` (title + description text) and `publish_metadata.json` (structured fields) next to the MP4 and thumbnail.

## Configuration

- **LLM:** set provider and keys in **Settings** in the Web UI (stored in SQLite); optional env-based overrides are listed in **[configuration.md](configuration.md)**.
- **Tuning:** longform/shortform duration bounds, snap slack, and max upload size—**Settings → Pipeline** (SQLite) or `clipengine_*` / `CLIPENGINE_MAX_UPLOAD_BYTES` in the environment—see **[configuration.md](configuration.md)**.
- **Publishing:** title/description modes for exports and YouTube—**Settings → Publishing** (SQLite); see **[configuration.md](configuration.md#publishing-sqlite-settings--publishing)**.

## Implementation

The Python package `clipengine` exposes **`clipengine.pipeline`** (`run_ingest`, `run_plan`, `run_render`). The **FastAPI** app and the **`clipengine_api.worker`** entrypoint both call **`clipengine_api.services.pipeline_execute.execute_pipeline_run`**, so in-process and Docker worker paths stay in sync.
