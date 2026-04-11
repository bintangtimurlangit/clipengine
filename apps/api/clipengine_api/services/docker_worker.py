"""Spawn ephemeral pipeline worker containers (Docker CLI from the API process)."""

from __future__ import annotations

import json
import logging
import os
import re
import shlex
import subprocess

log = logging.getLogger(__name__)


def docker_workers_env_overridden() -> bool:
    """True when ``CLIPENGINE_USE_DOCKER_WORKERS`` is set to a non-empty value (overrides Settings)."""
    raw = os.environ.get("CLIPENGINE_USE_DOCKER_WORKERS")
    return raw is not None and str(raw).strip() != ""


def _use_docker_workers_from_stored_settings() -> bool:
    """Read ``use_docker_workers`` from SQLite (Settings) when env does not override."""
    try:
        from clipengine_api.core import db as db_module

        raw = db_module.get_llm_settings_json()
        if not raw or not str(raw).strip():
            return False
        data = json.loads(raw)
        if not isinstance(data, dict):
            return False
        return bool(data.get("use_docker_workers") is True)
    except (json.JSONDecodeError, OSError) as e:
        log.debug("could not read use_docker_workers from settings: %s", e)
        return False


def use_docker_workers() -> bool:
    """Run the heavy pipeline in ephemeral worker containers when enabled.

    If ``CLIPENGINE_USE_DOCKER_WORKERS`` is set to a non-empty value, it wins (deploy override).
    Otherwise the value comes from Settings (``use_docker_workers`` in ``llm_settings_json``).
    """
    if docker_workers_env_overridden():
        raw = os.environ.get("CLIPENGINE_USE_DOCKER_WORKERS", "").strip().lower()
        return raw in ("1", "true", "yes", "on")
    return _use_docker_workers_from_stored_settings()


def worker_image() -> str:
    return (os.environ.get("CLIPENGINE_WORKER_IMAGE") or "clipengine-worker:latest").strip()


def container_name_for_run(run_id: str) -> str:
    """Docker container name for this run (``docker stop`` / ``docker run --name``)."""
    return _safe_container_name(run_id)


def _safe_container_name(run_id: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_.-]", "", run_id)
    if len(slug) > 40:
        slug = slug[:40]
    name = f"clipengine-w-{slug}"
    if len(name) > 63:
        name = name[:63]
    return name or f"clipengine-w-{run_id[:12]}"


def _volume_mount_args() -> list[str]:
    data_dir = os.environ.get("CLIPENGINE_DATA_DIR", "/data").strip()
    workspace = os.environ.get("CLIPENGINE_WORKSPACE", "/workspace").strip()
    vol_data = (os.environ.get("CLIPENGINE_DOCKER_VOLUME_DATA") or "clipengine_data").strip()
    vol_ws = (os.environ.get("CLIPENGINE_DOCKER_VOLUME_WORKSPACE") or "clipengine_workspace").strip()
    return ["-v", f"{vol_data}:{data_dir}", "-v", f"{vol_ws}:{workspace}"]


def _gpu_args() -> list[str]:
    gpus = (os.environ.get("CLIPENGINE_WORKER_GPUS") or "").strip()
    if not gpus or gpus.lower() in ("none", "false", "off"):
        return []
    return ["--gpus", gpus]


def _extra_run_args() -> list[str]:
    raw = (os.environ.get("CLIPENGINE_WORKER_DOCKER_RUN_ARGS") or "").strip()
    if not raw:
        return []
    return shlex.split(raw)


def _env_args() -> list[str]:
    """Pass through CLIPENGINE_* env so workers match the API (Settings are read from SQLite in the worker)."""
    out: list[str] = []
    skip = frozenset(
        {
            "CLIPENGINE_USE_DOCKER_WORKERS",
            "CLIPENGINE_WORKER_IMAGE",
            "CLIPENGINE_DOCKER_VOLUME_DATA",
            "CLIPENGINE_DOCKER_VOLUME_WORKSPACE",
            "CLIPENGINE_WORKER_GPUS",
            "CLIPENGINE_WORKER_DOCKER_RUN_ARGS",
        }
    )
    for k, v in os.environ.items():
        if not k.startswith("CLIPENGINE_") or k in skip:
            continue
        if v is None or not str(v).strip():
            continue
        out.extend(["-e", f"{k}={v}"])
    return out


def start_worker_container(run_id: str) -> tuple[str, str]:
    """Start a detached worker container. Returns (container_id, container_name)."""
    image = worker_image()
    name = container_name_for_run(run_id)
    cmd: list[str] = [
        "docker",
        "run",
        "-d",
        "--rm",
        "--name",
        name,
        *_gpu_args(),
        *_volume_mount_args(),
        *_env_args(),
        *_extra_run_args(),
        image,
        "python",
        "-m",
        "clipengine_api.worker",
        run_id,
    ]
    log.info("starting worker container for run %s: %s", run_id, " ".join(cmd[:12]))
    try:
        proc = subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except FileNotFoundError as e:
        raise RuntimeError("docker CLI not found — install Docker or disable CLIPENGINE_USE_DOCKER_WORKERS") from e
    except subprocess.CalledProcessError as e:
        err = (e.stderr or e.stdout or "")[:8000]
        raise RuntimeError(f"docker run failed: {err}") from e
    cid = (proc.stdout or "").strip()
    if not cid:
        raise RuntimeError("docker run produced no container id")
    return cid, name


def wait_container(container_id: str) -> int:
    """Block until the container exits; return its exit code."""
    proc = subprocess.run(
        ["docker", "wait", container_id],
        check=False,
        capture_output=True,
        text=True,
        timeout=86400,
    )
    if proc.returncode != 0:
        log.warning("docker wait rc=%s stderr=%s", proc.returncode, proc.stderr)
        return -1
    out = (proc.stdout or "").strip()
    try:
        return int(out)
    except ValueError:
        return -1


def stop_container(container_name: str) -> None:
    try:
        subprocess.run(
            ["docker", "stop", "-t", "30", container_name],
            check=False,
            capture_output=True,
            text=True,
            timeout=60,
        )
    except FileNotFoundError:
        log.warning("docker CLI not found; cannot stop container %s", container_name)
