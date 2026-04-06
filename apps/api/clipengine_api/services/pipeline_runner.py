"""Background pipeline execution (ingest → plan → render) using clipengine."""

from __future__ import annotations

import logging
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Any

from clipengine.pipeline import run_ingest, run_plan, run_plan_heuristic, run_render

from clipengine_api.core.env import apply_stored_llm_env
from clipengine_api.storage import runs_db
from clipengine_api.services.workspace import VIDEO_EXTENSIONS, run_dir

log = logging.getLogger(__name__)

_executor_lock = threading.Lock()
# Single-flight for MVP to avoid GPU OOM; can become a pool later
_pipeline_busy = False


def _find_video_in_run(rd: Path) -> Path | None:
    """Prefer source.* or input.* then any single video file."""
    for name in ("source.mp4", "source.webm", "source.mkv", "input.mp4", "video.mp4"):
        p = rd / name
        if p.is_file():
            return p
    for p in sorted(rd.iterdir()):
        if p.is_file() and p.suffix.lower() in VIDEO_EXTENSIONS:
            return p
    return None


def _run_pipeline_sync(run_id: str) -> None:
    global _pipeline_busy
    apply_stored_llm_env()
    rd = run_dir(run_id)
    rd.mkdir(parents=True, exist_ok=True)
    try:
        rec = runs_db.get_run(run_id)
        runs_db.update_run(run_id, status="running", step="ingest", error=None)

        video = _find_video_in_run(rd)
        if video is None:
            raise FileNotFoundError("No video file in run directory; upload or fetch first.")

        title = rec.title
        run_ingest(
            video,
            rd,
            whisper_model=rec.whisper_model,
            device=rec.whisper_device,
            compute_type=rec.whisper_compute_type,
        )

        runs_db.update_run(run_id, step="plan")
        transcript_path = rd / "transcript.json"
        plan_path = rd / "cut_plan.json"
        extra0 = runs_db.get_run_extra_dict(run_id)
        skip_llm = str(extra0.get("planMode") or "").lower() == "heuristic"
        if skip_llm:
            run_plan_heuristic(transcript_path, plan_path, title=title)
        else:
            run_plan(
                transcript_path,
                plan_path,
                title=title,
                verbose=0,
            )

        runs_db.update_run(run_id, step="render")
        rendered = rd / "rendered"
        run_render(
            plan_path,
            video,
            rendered,
            transcript_path=transcript_path,
        )

        extra: dict[str, Any] = runs_db.get_run_extra_dict(run_id)
        od: dict[str, Any] = extra.get("outputDestination") or {}
        kind = od.get("kind", "workspace")

        if kind == "google_drive":
            folder_id = str(od.get("googleDriveFolderId") or "").strip()
            if not folder_id:
                raise ValueError(
                    "Google Drive output folder is missing — choose a destination folder when starting."
                )
            from clipengine_api.services.google_drive import upload_rendered_mp4s

            upload_rendered_mp4s(rd, folder_id)

        if kind == "s3":
            from clipengine_api.services import s3_output

            override = str(od.get("s3KeyPrefix") or "").strip() or None
            s3_output.upload_rendered_mp4s(rd, run_id, key_prefix_override=override)

        if kind == "smb":
            from clipengine_api.services import smb_output

            sub = str(od.get("smbSubpath") or "").strip() or None
            smb_output.upload_rendered_mp4s(rd, run_id, subpath_extra=sub)

        if kind == "local_bind":
            from clipengine_api.services.local_bind_output import copy_rendered_mp4s

            dest = Path(str(od.get("localBindPath") or "").strip()).resolve()
            if not dest.is_dir():
                raise ValueError(f"local bind destination is not a directory: {dest}")
            copy_rendered_mp4s(rd, dest, run_id)

        runs_db.update_run(run_id, status="completed", step="done")
    except Exception as e:
        log.exception("pipeline failed for %s", run_id)
        runs_db.update_run(run_id, status="failed", error=str(e))
    finally:
        with _executor_lock:
            _pipeline_busy = False


def start_pipeline(run_id: str) -> bool:
    """Start pipeline in a daemon thread. Returns False if busy or run not ready."""
    global _pipeline_busy
    rec = runs_db.get_run(run_id)
    if rec.status != "ready":
        return False
    rd = run_dir(run_id)
    if not _find_video_in_run(rd):
        return False
    with _executor_lock:
        if _pipeline_busy:
            return False
        _pipeline_busy = True
    t = threading.Thread(target=_run_pipeline_sync, args=(run_id,), daemon=True)
    t.start()
    return True


def fetch_youtube(run_id: str, url: str) -> None:
    """Download video with yt-dlp into run directory."""
    rd = run_dir(run_id)
    rd.mkdir(parents=True, exist_ok=True)
    out_template = str(rd / "source.%(ext)s")
    # Prefer merged mp4
    cmd = [
        "yt-dlp",
        "-f",
        "bv*+ba/b",
        "--merge-output-format",
        "mp4",
        "-o",
        out_template,
        "--no-playlist",
        url,
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=3600)
    except subprocess.CalledProcessError as e:
        err = (e.stderr or e.stdout or "")[:4000]
        raise RuntimeError(f"yt-dlp failed: {err}") from e
    except FileNotFoundError as e:
        raise RuntimeError("yt-dlp not installed on server") from e


def copy_local_file(run_id: str, src: Path) -> Path:
    """Copy a file from an allowlisted path into run dir as source + original ext."""
    rd = run_dir(run_id)
    rd.mkdir(parents=True, exist_ok=True)
    dest = rd / f"source{src.suffix.lower()}"
    shutil.copy2(src, dest)
    return dest
