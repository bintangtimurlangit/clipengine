# Pipeline (ingest → plan → render)

Clip Engine runs the same three stages whether you use the **Web UI** or call the **HTTP API**. There is **no separate terminal CLI** in this repository.

## Stages

| Stage | What happens | Main outputs |
|-------|----------------|--------------|
| **Ingest** | FFmpeg extracts audio; speech-to-text via **local faster-whisper** (fixed **tiny** model) or **OpenAI** [`audio/transcriptions`](https://platform.openai.com/docs/guides/speech-to-text) (`whisper-1`), chosen under **Settings → Transcription** | `transcript.json`, `segments.vtt`, `audio_16k_mono.wav` |
| **Plan** | LLM proposes cut windows (OpenAI-compatible or Anthropic); optional **Tavily** if `TAVILY_API_KEY` is set | `cut_plan.json` (per clip: `title`, `rationale`, `publish_description`, etc.) |
| **Render** | FFmpeg produces longform (16:9) and shortform (9:16) MP4s plus a JPEG thumbnail per clip | `rendered/longform/*.mp4`, `rendered/longform/*.jpg`, `rendered/shortform/*.mp4`, `rendered/shortform/*.jpg` |

Shortform JPEGs are cropped with FFmpeg *cropdetect* so thumbnails omit black padding from the encoded 9:16 frame; longform thumbnails are a full-frame sample.

**Full run:** the dashboard **Start pipeline** action chains all three in one workspace folder (equivalent to the old “run-all” concept).

If no LLM API key is configured for the selected provider, the UI offers **Configure LLM first** or **Run without LLM**. The latter writes `cut_plan.json` using simple time windows (heuristic plan), then render runs as usual.

**API:** `POST /api/runs/{id}/start` accepts `skip_llm_plan: true` to use the heuristic planner; without it, the API returns **400** when the LLM is not configured.

## Output destination (per run)

When you click **Start pipeline**, you choose where **rendered** output goes (independent of where the source video came from).

### Portable “anywhere” (best for VPS / cloud)

| Choice | Behavior |
|--------|----------|
| **Workspace** | Default: keep everything on the server under the run until you delete it. |
| **Google Drive** | After render, **MP4s and JPEG thumbnails under `rendered/`** are uploaded to a **folder** you specify (your own OAuth client in **Settings**; you may need to re-authorize after upgrades that add upload scope). |
| **S3** | After render, MP4s and thumbnails are uploaded to your bucket using **access key credentials** stored in **Settings** (AWS, MinIO, Cloudflare R2, etc.). Default object prefix is `{settings prefix}{run id}/…`; optional per-run prefix overrides that. |
| **Local path (bind mount)** | After render, MP4s and thumbnails are copied under a **directory you choose** inside the container (e.g. `/<mount>/exports`). Mount host folders in Docker first, then **register** those paths in **Settings → Storage → Local path** so they are allowlisted; the run must target a path under that allowlist (or under workspace / `CLIPENGINE_IMPORT_ROOTS`). |

### SMB (optional: LAN / trusted network only)

| Choice | Behavior |
|--------|----------|
| **SMB** | After render, MP4s and thumbnails are written to a **Windows/SMB share** using host, share, and credentials in **Settings**. The API must reach **TCP 445** on the file server. |

**Security:** do **not** expose SMB to the **public internet**. Use SMB only on a **private LAN** or over a **VPN / tailnet** (e.g. Tailscale) where the NAS is reachable on private IPs. For remote storage from a VPS, prefer **S3**, **Google Drive**, or **workspace**; or use **VPN + mount** the share on the host and use normal paths instead of in-app SMB.

### Imports without extra plugins

You can **mount** NFS, S3 (`rclone mount`), or a tailnet-accessible share on the host, set **`CLIPENGINE_IMPORT_ROOTS`**, and import from those paths—no separate “remote NAS” plugin required.

## Artifacts (typical run folder)

| Path | Produced by |
|------|----------------|
| `transcript.json` | Ingest |
| `segments.vtt` | Ingest |
| `audio_16k_mono.wav` | Ingest |
| `cut_plan.json` | Plan: each clip has `title`, `rationale` (editorial reasoning), and `publish_description` (short public copy for uploads; **heuristic** plans leave it empty) |
| `llm_activity.log` | Plan (LLM runs only): verbose foundation + cut-plan output for the Web UI terminal |
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

The Python package `clipengine` exposes **`clipengine.pipeline`** (`run_ingest`, `run_plan`, `run_render`), which the **FastAPI** service invokes for each job.
