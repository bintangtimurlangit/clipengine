"""YouTube (and generic) live stream capture via yt-dlp with tracked subprocesses for cancel/stop."""

from __future__ import annotations

import logging
import os
import shlex
import subprocess
import threading
import time
from pathlib import Path
from typing import Any

from clipengine_api.storage import runs_db
from clipengine_api.services.pipeline_execute import find_video_for_run
from clipengine_api.services.workspace import run_dir

log = logging.getLogger(__name__)

_lock = threading.Lock()
# run_id -> subprocess.Popen for active yt-dlp (VOD fetch or live record)
_tracked: dict[str, subprocess.Popen] = {}


def _extra_args_from_env(key: str) -> list[str]:
    raw = (os.environ.get(key) or "").strip()
    if not raw:
        return []
    try:
        return shlex.split(raw)
    except ValueError:
        log.warning("invalid shlex for %s, ignoring", key)
        return []


def register_process(run_id: str, proc: subprocess.Popen) -> None:
    with _lock:
        _tracked[run_id] = proc


def unregister_process(run_id: str) -> None:
    with _lock:
        _tracked.pop(run_id, None)


def terminate_process(run_id: str) -> bool:
    """SIGTERM tracked yt-dlp for this run; then SIGKILL if needed. Returns True if a process was stopped."""
    with _lock:
        proc = _tracked.get(run_id)
    if proc is None:
        return False
    try:
        if proc.poll() is not None:
            return False
        proc.terminate()
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=10)
    except Exception as e:
        log.warning("terminate_process %s: %s", run_id, e)
    return True


def live_max_seconds() -> int:
    raw = (os.environ.get("CLIPENGINE_LIVE_MAX_SECONDS") or "").strip()
    if raw:
        try:
            return max(60, min(86400, int(raw)))
        except ValueError:
            pass
    return 7200


def live_min_bytes() -> int:
    raw = (os.environ.get("CLIPENGINE_LIVE_MIN_BYTES") or "").strip()
    if raw:
        try:
            return max(1024, int(raw))
        except ValueError:
            pass
    return 256 * 1024


def _yt_dlp_cmd(url: str, out_template: str, *, live: bool) -> list[str]:
    cmd: list[str] = [
        "yt-dlp",
        "-f",
        "bv*+ba/b",
        "--merge-output-format",
        "mp4",
        "-o",
        out_template,
        "--no-playlist",
    ]
    if live:
        cmd.extend(_extra_args_from_env("CLIPENGINE_LIVE_YTDLP_EXTRA_ARGS"))
    else:
        cmd.extend(_extra_args_from_env("CLIPENGINE_YTDLP_EXTRA_ARGS"))
    cmd.append(url)
    return cmd


def _open_log(rd: Path) -> Any:
    log_path = rd / "yt-dlp.log"
    return open(log_path, "a", encoding="utf-8")


def run_youtube_fetch_blocking(run_id: str, url: str) -> None:
    """One-shot VOD download; subprocess is tracked so cancel can SIGTERM yt-dlp."""
    rd = run_dir(run_id)
    rd.mkdir(parents=True, exist_ok=True)
    out_template = str(rd / "source.%(ext)s")
    cmd = _yt_dlp_cmd(url, out_template, live=False)
    log_f = _open_log(rd)
    try:
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=log_f,
                stderr=subprocess.STDOUT,
                text=True,
            )
        except FileNotFoundError:
            raise RuntimeError("yt-dlp not installed on server") from None
        register_process(run_id, proc)
        try:
            proc.wait(timeout=3600)
        except subprocess.TimeoutExpired:
            proc.terminate()
            try:
                proc.wait(timeout=30)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=15)
            raise RuntimeError("yt-dlp timed out after 3600s") from None
        if runs_db.get_run(run_id).status == "cancelled":
            return
        if proc.returncode != 0:
            raise RuntimeError(f"yt-dlp exited with code {proc.returncode}; see yt-dlp.log in run folder")
    finally:
        unregister_process(run_id)
        try:
            log_f.close()
        except OSError:
            pass


def _finalize_live_recording(run_id: str) -> None:
    """After yt-dlp exits, promote run to ready or failed."""
    video = find_video_for_run(run_id)
    if video is None or not video.is_file():
        runs_db.update_run(
            run_id,
            status="failed",
            error="No video file produced — stream may be unavailable, DRM-blocked, or recording was too short.",
        )
        return
    min_b = live_min_bytes()
    if video.stat().st_size < min_b:
        runs_db.update_run(
            run_id,
            status="failed",
            error=f"Recording smaller than minimum ({min_b} bytes) — try a longer capture or check the URL.",
        )
        return
    runs_db.update_run(
        run_id,
        status="ready",
        source_filename=video.name,
        local_source_path=str(video),
    )


def run_youtube_live_blocking(run_id: str, url: str) -> None:
    """Record until stream ends, max duration, cancel, or external stop (terminate)."""
    rd = run_dir(run_id)
    rd.mkdir(parents=True, exist_ok=True)
    out_template = str(rd / "source.%(ext)s")
    cmd = _yt_dlp_cmd(url, out_template, live=True)
    log_f = _open_log(rd)
    max_s = live_max_seconds()
    try:
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=log_f,
                stderr=subprocess.STDOUT,
                text=True,
            )
        except FileNotFoundError:
            runs_db.update_run(run_id, status="failed", error="yt-dlp not installed on server")
            raise RuntimeError("yt-dlp not installed on server") from None

        register_process(run_id, proc)
        deadline = time.monotonic() + max_s
        try:
            while proc.poll() is None:
                rec = runs_db.get_run(run_id)
                if rec.status == "cancelled":
                    proc.terminate()
                    break
                if time.monotonic() >= deadline:
                    log.info("live capture max duration reached for %s", run_id)
                    proc.terminate()
                    break
                time.sleep(0.4)
            proc.wait(timeout=120)
        finally:
            unregister_process(run_id)

        rc = proc.returncode
        if rc not in (0, -15, -2):
            log.warning(
                "yt-dlp exit code %s for run %s (may still have partial file)",
                rc,
                run_id,
            )
    finally:
        try:
            log_f.close()
        except OSError:
            pass

    rec = runs_db.get_run(run_id)
    if rec.status == "cancelled":
        return
    _finalize_live_recording(run_id)
