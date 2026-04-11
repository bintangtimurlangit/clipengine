"""Background pipeline execution (ingest → plan → render) using clipengine."""

from __future__ import annotations

import logging
import shutil
import threading
from pathlib import Path
from typing import Any

from clipengine_api.storage import runs_db
from clipengine_api.services.docker_worker import (
    container_name_for_run,
    start_worker_container,
    stop_container,
    use_docker_workers,
    wait_container,
)
from clipengine_api.services.live_capture import terminate_process
from clipengine_api.services.pipeline_execute import execute_pipeline_run, find_video_for_run

log = logging.getLogger(__name__)

_executor_lock = threading.Lock()
# Single-flight for in-process mode to avoid GPU OOM; ignored when docker workers are enabled
_pipeline_busy = False
# In-process: set while the pipeline thread for this run_id is active.
_current_pipeline_run_id: str | None = None


def cancel_run(run_id: str) -> dict[str, Any]:
    """Mark a run as cancelled and release the pipeline lock or stop the worker container."""
    global _pipeline_busy, _current_pipeline_run_id
    rec = runs_db.get_run(run_id)
    if rec.status not in ("pending", "fetching", "recording", "running", "ready"):
        raise ValueError(f"Run cannot be cancelled (status: {rec.status})")
    runs_db.update_run(run_id, status="cancelled", error="Cancelled by user")
    terminate_process(run_id)
    if use_docker_workers():
        stop_container(container_name_for_run(run_id))
    if not use_docker_workers():
        with _executor_lock:
            if _current_pipeline_run_id == run_id:
                _pipeline_busy = False
                _current_pipeline_run_id = None
    return {"run": runs_db.get_run(run_id).to_dict()}


def _run_pipeline_sync(run_id: str) -> None:
    """In-process pipeline (same interpreter as FastAPI)."""
    global _pipeline_busy, _current_pipeline_run_id
    with _executor_lock:
        _current_pipeline_run_id = run_id
    try:
        execute_pipeline_run(run_id)
    finally:
        with _executor_lock:
            if _current_pipeline_run_id == run_id:
                _pipeline_busy = False
                _current_pipeline_run_id = None


def _run_pipeline_docker_thread(run_id: str) -> None:
    """Start a detached worker container and wait for it; release bookkeeping when done."""
    try:
        cid, _cname = start_worker_container(run_id)
        exit_code = wait_container(cid)
        rec = runs_db.get_run(run_id)
        if rec.status == "cancelled":
            return
        if exit_code != 0 and rec.status not in ("completed", "failed"):
            msg = f"worker container exited with code {exit_code}"
            runs_db.update_run(run_id, status="failed", error=msg)
    except Exception as e:
        log.exception("docker worker failed for %s", run_id)
        rec = runs_db.get_run(run_id)
        if rec.status not in ("cancelled", "completed", "failed"):
            runs_db.update_run(run_id, status="failed", error=str(e))


def start_pipeline(run_id: str) -> bool:
    """Start pipeline in a daemon thread. Returns False if busy or run not ready."""
    global _pipeline_busy
    rec = runs_db.get_run(run_id)
    if rec.status != "ready":
        return False
    if not find_video_for_run(run_id):
        return False

    if use_docker_workers():
        if not runs_db.claim_run_if_ready(run_id):
            return False
        if not find_video_for_run(run_id):
            runs_db.revert_run_to_ready(run_id)
            return False
        t = threading.Thread(target=_run_pipeline_docker_thread, args=(run_id,), daemon=True)
        t.start()
        return True

    with _executor_lock:
        if _pipeline_busy:
            return False
        _pipeline_busy = True
    t = threading.Thread(target=_run_pipeline_sync, args=(run_id,), daemon=True)
    t.start()
    return True


def fetch_youtube(run_id: str, url: str) -> None:
    """Download video with yt-dlp into run directory (subprocess tracked for cancel)."""
    from clipengine_api.services.live_capture import run_youtube_fetch_blocking

    run_youtube_fetch_blocking(run_id, url)


def copy_local_file(run_id: str, src: Path) -> Path:
    """Copy a file from an allowlisted path into run dir as source + original ext."""
    from clipengine_api.services.workspace import run_dir

    rd = run_dir(run_id)
    rd.mkdir(parents=True, exist_ok=True)
    dest = rd / f"source{src.suffix.lower()}"
    shutil.copy2(src, dest)
    return dest
