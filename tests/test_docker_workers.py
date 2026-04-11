"""Tests for ephemeral Docker worker helpers and run claiming."""

from __future__ import annotations

import json
import sys
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture()
def in_memory_runs(monkeypatch, tmp_path):
    if sys.version_info < (3, 10):
        pytest.skip("runs_db / clipengine_api require Python 3.10+")
    monkeypatch.setenv("CLIPENGINE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLIPENGINE_WORKSPACE", str(tmp_path / "ws"))
    from clipengine_api.core import db as db_module
    from clipengine_api.storage import runs_db

    db_module.init_db()
    runs_db.init_runs_table()
    return runs_db


def test_use_docker_workers_env(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("CLIPENGINE_DATA_DIR", str(tmp_path))
    from clipengine_api.core import db as db_module
    from clipengine_api.services import docker_worker

    db_module.init_db()
    db_module.save_llm_settings_json(json.dumps({"use_docker_workers": False}))

    for off in ("0", "false", "no", "FALSE"):
        monkeypatch.setenv("CLIPENGINE_USE_DOCKER_WORKERS", off)
        assert docker_worker.use_docker_workers() is False
    for on in ("1", "true", "yes", "on", "TRUE"):
        monkeypatch.setenv("CLIPENGINE_USE_DOCKER_WORKERS", on)
        assert docker_worker.use_docker_workers() is True

    monkeypatch.delenv("CLIPENGINE_USE_DOCKER_WORKERS", raising=False)
    db_module.save_llm_settings_json(json.dumps({"use_docker_workers": False}))
    assert docker_worker.use_docker_workers() is False
    db_module.save_llm_settings_json(json.dumps({"use_docker_workers": True}))
    assert docker_worker.use_docker_workers() is True

    monkeypatch.setenv("CLIPENGINE_USE_DOCKER_WORKERS", "")
    assert docker_worker.use_docker_workers() is True
    monkeypatch.setenv("CLIPENGINE_USE_DOCKER_WORKERS", "   ")
    assert docker_worker.use_docker_workers() is True


def test_container_name_for_run_stable_uuid() -> None:
    from clipengine_api.services.docker_worker import container_name_for_run

    rid = "550e8400-e29b-41d4-a716-446655440000"
    n = container_name_for_run(rid)
    assert n.startswith("clipengine-w-")
    assert len(n) <= 63
    assert container_name_for_run(rid) == n


def test_claim_run_if_ready_and_revert(in_memory_runs) -> None:
    from clipengine_api.storage import runs_db

    r = runs_db.create_run(source_type="upload", status="ready")
    assert runs_db.claim_run_if_ready(r.id) is True
    again = runs_db.get_run(r.id)
    assert again.status == "running"
    assert again.step == "queued"
    assert runs_db.claim_run_if_ready(r.id) is False
    runs_db.revert_run_to_ready(r.id)
    back = runs_db.get_run(r.id)
    assert back.status == "ready"
    assert back.step is None


def test_claim_only_when_ready(in_memory_runs) -> None:
    from clipengine_api.storage import runs_db

    r = runs_db.create_run(source_type="upload", status="pending")
    assert runs_db.claim_run_if_ready(r.id) is False


def test_docker_run_cmd_contains_worker_module(monkeypatch) -> None:
    from clipengine_api.services import docker_worker

    monkeypatch.setenv("CLIPENGINE_USE_DOCKER_WORKERS", "1")
    monkeypatch.setenv("CLIPENGINE_DATA_DIR", "/data")
    monkeypatch.setenv("CLIPENGINE_WORKSPACE", "/workspace")
    rid = "550e8400-e29b-41d4-a716-446655440000"
    captured: dict[str, object] = {}

    def fake_run(cmd, **kwargs):  # noqa: ANN001
        captured["cmd"] = cmd
        result = MagicMock()
        result.stdout = "deadbeef123\n"
        result.returncode = 0
        return result

    with patch.object(docker_worker.subprocess, "run", side_effect=fake_run):
        cid, name = docker_worker.start_worker_container(rid)
    assert cid == "deadbeef123"
    cmd = captured["cmd"]
    assert isinstance(cmd, list)
    assert "docker" in cmd[0]
    assert "-d" in cmd
    assert "--rm" in cmd
    assert "--name" in cmd
    assert cmd[cmd.index("--name") + 1] == name
    assert "python" in cmd
    assert "-m" in cmd
    assert cmd[-2] == "clipengine_api.worker"
    assert cmd[-1] == rid


def test_wait_container_parses_exit_code() -> None:
    from clipengine_api.services import docker_worker

    with patch.object(docker_worker.subprocess, "run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout="137\n", stderr="")
        assert docker_worker.wait_container("abc") == 137


def test_gpu_args_empty_when_unset(monkeypatch) -> None:
    from clipengine_api.services import docker_worker

    monkeypatch.delenv("CLIPENGINE_WORKER_GPUS", raising=False)
    assert docker_worker._gpu_args() == []


def test_gpu_args_when_set(monkeypatch) -> None:
    from clipengine_api.services import docker_worker

    monkeypatch.setenv("CLIPENGINE_WORKER_GPUS", "all")
    assert docker_worker._gpu_args() == ["--gpus", "all"]


def test_env_args_skips_worker_control_vars(monkeypatch) -> None:
    from clipengine_api.services import docker_worker

    monkeypatch.setenv("CLIPENGINE_USE_DOCKER_WORKERS", "true")
    monkeypatch.setenv("CLIPENGINE_WORKER_IMAGE", "myimg:latest")
    monkeypatch.setenv("CLIPENGINE_FOO", "bar")
    out = docker_worker._env_args()
    flat = " ".join(out)
    assert "CLIPENGINE_FOO=bar" in flat
    assert "CLIPENGINE_USE_DOCKER_WORKERS" not in flat
    assert "CLIPENGINE_WORKER_IMAGE" not in flat
