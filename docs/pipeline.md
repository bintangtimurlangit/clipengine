# Pipeline (ingest → plan → render)

Clip Engine runs the same three stages whether you use the **Web UI** or call the **HTTP API**. There is **no separate terminal CLI** in this repository.

## Stages

| Stage | What happens | Main outputs |
|-------|----------------|--------------|
| **Ingest** | FFmpeg extracts audio; **faster-whisper** transcribes | `transcript.json`, `segments.vtt`, `audio_16k_mono.wav` |
| **Plan** | LLM proposes cut windows (OpenAI-compatible or Anthropic); optional **Tavily** if `TAVILY_API_KEY` is set | `cut_plan.json` |
| **Render** | FFmpeg produces longform (16:9) and shortform (9:16) MP4s | `rendered/longform/*.mp4`, `rendered/shortform/*.mp4` |

**Full run:** the dashboard **Start pipeline** action chains all three in one workspace folder (equivalent to the old “run-all” concept).

## Output destination (per run)

When you click **Start pipeline**, you choose where **rendered** output goes (independent of where the source video came from).

### Portable “anywhere” (best for VPS / cloud)

| Choice | Behavior |
|--------|----------|
| **Workspace** | Default: keep everything on the server under the run until you delete it. |
| **Temporary (12 h)** | After the pipeline **completes**, the run is marked with an expiry; about **12 hours** later the API deletes that run’s workspace folder and sets status to `expired`. |
| **Google Drive** | After render, **MP4s under `rendered/`** are uploaded to a **folder** you specify (your own OAuth client in **Settings**; you may need to re-authorize after upgrades that add upload scope). |
| **S3** | After render, MP4s are uploaded to your bucket using **access key credentials** stored in **Settings** (AWS, MinIO, Cloudflare R2, etc.). Default object prefix is `{settings prefix}{run id}/…`; optional per-run prefix overrides that. |
| **Local path (bind mount)** | After render, MP4s are copied under a **directory you choose** inside the container (e.g. `/<mount>/exports`). Mount host folders in Docker first, then **register** those paths in **Settings → Storage → Local path** so they are allowlisted; the run must target a path under that allowlist (or under workspace / `CLIPENGINE_IMPORT_ROOTS`). |

### SMB (optional: LAN / trusted network only)

| Choice | Behavior |
|--------|----------|
| **SMB** | After render, MP4s are written to a **Windows/SMB share** using host, share, and credentials in **Settings**. The API must reach **TCP 445** on the file server. |

**Security:** do **not** expose SMB to the **public internet**. Use SMB only on a **private LAN** or over a **VPN / tailnet** (e.g. Tailscale) where the NAS is reachable on private IPs. For remote storage from a VPS, prefer **S3**, **Google Drive**, or **workspace**; or use **VPN + mount** the share on the host and use normal paths instead of in-app SMB.

### Imports without extra plugins

You can **mount** NFS, S3 (`rclone mount`), or a tailnet-accessible share on the host, set **`CLIPENGINE_IMPORT_ROOTS`**, and import from those paths—no separate “remote NAS” plugin required.

## Artifacts (typical run folder)

| Path | Produced by |
|------|----------------|
| `transcript.json` | Ingest |
| `segments.vtt` | Ingest |
| `audio_16k_mono.wav` | Ingest |
| `cut_plan.json` | Plan |
| `rendered/longform/*.mp4` | Render |
| `rendered/shortform/*.mp4` | Render |

## Configuration

- **LLM:** set provider and keys in **Settings** in the Web UI (stored in SQLite); optional env-based overrides are listed in **[configuration.md](configuration.md)**.
- **Tuning:** optional `clipengine_*` variables (duration limits, snap slack)—see **[configuration.md](configuration.md)**.

## Implementation

The Python package `clipengine` exposes **`clipengine.pipeline`** (`run_ingest`, `run_plan`, `run_render`), which the **FastAPI** service invokes for each job.
