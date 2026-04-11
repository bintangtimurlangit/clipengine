"""Tests for clearing pipeline artifacts and restarting runs to ``ready``."""

from __future__ import annotations

import json

import pytest


@pytest.fixture()
def in_memory_runs(monkeypatch, tmp_path):
    monkeypatch.setenv("CLIPENGINE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLIPENGINE_WORKSPACE", str(tmp_path / "ws"))
    from clipengine_api.core import db as db_module
    from clipengine_api.storage import runs_db

    db_module.init_db()
    runs_db.init_runs_table()
    return runs_db


def test_clear_pipeline_artifacts_keeps_source_video(tmp_path) -> None:
    from clipengine_api.services.pipeline_restart import clear_pipeline_artifacts

    rd = tmp_path / "run1"
    rd.mkdir()
    (rd / "source.mp4").write_bytes(b"vid")
    (rd / "transcript.json").write_text("{}", encoding="utf-8")
    (rd / "cut_plan.json").write_text("{}", encoding="utf-8")
    rendered = rd / "rendered" / "longform"
    rendered.mkdir(parents=True)
    (rendered / "a.mp4").write_bytes(b"x")

    clear_pipeline_artifacts(rd)

    assert (rd / "source.mp4").is_file()
    assert not (rd / "transcript.json").exists()
    assert not (rd / "cut_plan.json").exists()
    assert not (rd / "rendered").exists()


def test_restart_run_to_ready_rejects_non_terminal(in_memory_runs) -> None:
    from clipengine_api.services.pipeline_restart import restart_run_to_ready
    from clipengine_api.storage import runs_db

    r = runs_db.create_run(source_type="upload", status="ready")
    with pytest.raises(ValueError, match="cannot be restarted"):
        restart_run_to_ready(r.id)


def test_restart_run_to_ready_clears_workspace_and_extra(in_memory_runs) -> None:
    from clipengine_api.services.pipeline_restart import restart_run_to_ready
    from clipengine_api.services.workspace import run_dir
    from clipengine_api.storage import runs_db

    r = runs_db.create_run(source_type="upload", status="completed")
    runs_db.merge_run_extra(
        r.id,
        {"publishedYoutube": {"videos": [{"watchUrl": "https://youtu.be/x"}]}},
    )
    rd = run_dir(r.id)
    rd.mkdir(parents=True)
    (rd / "source.mp4").write_bytes(b"v")
    (rd / "transcript.json").write_text("{}", encoding="utf-8")
    (rd / "rendered").mkdir()
    (rd / "rendered" / "x.mp4").write_bytes(b"r")

    restart_run_to_ready(r.id)

    again = runs_db.get_run(r.id)
    assert again.status == "ready"
    assert again.step is None
    assert again.error is None
    ex = json.loads(again.extra_json) if again.extra_json else {}
    assert "publishedYoutube" not in ex
    assert (rd / "source.mp4").is_file()
    assert not (rd / "transcript.json").exists()
    assert not (rd / "rendered").exists()
