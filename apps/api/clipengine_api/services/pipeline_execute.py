"""Shared pipeline body (ingest → plan → render + outputs) for API process or worker container."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Literal

from clipengine.pipeline import run_ingest, run_plan, run_plan_heuristic, run_render

from clipengine_api.core.env import apply_stored_llm_env
from clipengine_api.storage import runs_db
from clipengine_api.services.telegram_notifications import notify_run_finished
from clipengine_api.services.workspace import VIDEO_EXTENSIONS, run_dir

log = logging.getLogger(__name__)

PipelineOutcome = Literal["completed", "cancelled", "failed"]


class PipelineCancelled(Exception):
    """Raised when the run was marked cancelled in the database."""


def _ensure_not_cancelled(run_id: str) -> None:
    if runs_db.get_run(run_id).status == "cancelled":
        raise PipelineCancelled()


def find_video_for_run(run_id: str) -> Path | None:
    """Return the source video file for a run workspace, or ``None`` if missing."""
    return _find_video_in_run(run_dir(run_id))


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


def _audio_stream_index_from_extra(extra: dict[str, Any]) -> int:
    raw = extra.get("audioStreamIndex", 0)
    try:
        n = int(raw)
    except (TypeError, ValueError):
        return 0
    return n if n >= 0 else 0


def execute_pipeline_run(run_id: str) -> PipelineOutcome:
    """Run ingest → plan → render and optional uploads. Safe to call from a worker process."""
    apply_stored_llm_env()
    tb = (os.environ.get("CLIPENGINE_TRANSCRIPTION_BACKEND") or "local").lower().strip()
    runs_db.merge_run_extra(run_id, {"transcriptionBackend": tb})
    rd = run_dir(run_id)
    rd.mkdir(parents=True, exist_ok=True)
    try:
        rec = runs_db.get_run(run_id)
        _ensure_not_cancelled(run_id)
        runs_db.update_run(run_id, status="running", step="ingest", error=None)

        video = _find_video_in_run(rd)
        if video is None:
            raise FileNotFoundError("No video file in run directory; upload or fetch first.")

        extra_start = runs_db.get_run_extra_dict(run_id)
        audio_stream_index = _audio_stream_index_from_extra(extra_start)

        title = rec.title
        run_ingest(
            video,
            rd,
            whisper_model=rec.whisper_model,
            device=rec.whisper_device,
            compute_type=rec.whisper_compute_type,
            audio_stream_index=audio_stream_index,
        )

        _ensure_not_cancelled(run_id)
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
                llm_activity_log=rd / "llm_activity.log",
            )

        _ensure_not_cancelled(run_id)
        runs_db.update_run(run_id, step="render")
        rendered = rd / "rendered"
        run_render(
            plan_path,
            video,
            rendered,
            transcript_path=transcript_path,
            audio_stream_index=audio_stream_index,
        )

        _ensure_not_cancelled(run_id)
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

        if kind == "youtube":
            from clipengine_api.services.youtube_upload import upload_rendered_mp4s as yt_upload

            priv = str(od.get("youtubePrivacy") or "private").lower()
            if priv not in ("private", "unlisted", "public"):
                priv = "private"
            rec_title = runs_db.get_run(run_id).title
            videos = yt_upload(rd, run_title=rec_title, privacy_status=priv)
            runs_db.merge_run_extra(run_id, {"publishedYoutube": {"videos": videos}})

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

        _ensure_not_cancelled(run_id)
        runs_db.update_run(run_id, status="completed", step="done")
        notify_run_finished(run_id, success=True)
        return "completed"
    except PipelineCancelled:
        log.info("pipeline cancelled for %s", run_id)
        return "cancelled"
    except Exception as e:
        log.exception("pipeline failed for %s", run_id)
        rec2 = runs_db.get_run(run_id)
        if rec2.status != "cancelled":
            err_msg = str(e)
            runs_db.update_run(run_id, status="failed", error=err_msg)
            notify_run_finished(run_id, success=False, error=err_msg)
            return "failed"
        return "cancelled"
