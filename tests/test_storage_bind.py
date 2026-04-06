"""Bind path registration and local output copy."""

from __future__ import annotations

import json

import pytest


@pytest.fixture()
def api_env(monkeypatch, tmp_path):
    monkeypatch.setenv("CLIPENGINE_DATA_DIR", str(tmp_path))
    ws = tmp_path / "ws"
    ws.mkdir()
    monkeypatch.setenv("CLIPENGINE_WORKSPACE", str(ws))


def test_import_roots_includes_registered_bind_paths(api_env, tmp_path) -> None:
    from clipengine_api.core import db as db_module
    from clipengine_api.services import workspace

    bind = tmp_path / "bind"
    bind.mkdir()
    db_module.init_db()
    db_module.save_storage_bind_paths_json(json.dumps([str(bind.resolve())]))
    roots = workspace.import_roots()
    resolved = {str(p.resolve()) for p in roots}
    assert str(bind.resolve()) in resolved


def test_copy_rendered_mp4s_creates_mirror(api_env, tmp_path) -> None:
    from clipengine_api.services.local_bind_output import copy_rendered_mp4s

    run_dir = tmp_path / "run"
    (run_dir / "rendered" / "longform").mkdir(parents=True)
    mp4 = run_dir / "rendered" / "longform" / "a.mp4"
    mp4.write_bytes(b"fake")
    jpg = run_dir / "rendered" / "longform" / "a.jpg"
    jpg.write_bytes(b"fakejpg")
    dest_root = tmp_path / "out"
    dest_root.mkdir()
    copied = copy_rendered_mp4s(run_dir, dest_root, "run-1")
    assert len(copied) == 2
    assert (dest_root / "run-1" / "rendered" / "longform" / "a.mp4").is_file()
    assert (dest_root / "run-1" / "rendered" / "longform" / "a.jpg").is_file()
