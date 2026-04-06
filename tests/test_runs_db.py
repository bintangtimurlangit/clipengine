"""Tests for clipengine_api.storage.runs_db CRUD operations."""

from __future__ import annotations

import json

import pytest


@pytest.fixture()
def db_env(monkeypatch, tmp_path):
    monkeypatch.setenv("CLIPENGINE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLIPENGINE_WORKSPACE", str(tmp_path / "ws"))
    from clipengine_api.core import db as db_module
    from clipengine_api.storage import runs_db

    db_module.init_db()
    runs_db.init_runs_table()
    return runs_db


# ---------------------------------------------------------------------------
# create_run / get_run
# ---------------------------------------------------------------------------


def test_create_run_minimal(db_env) -> None:
    runs_db = db_env
    r = runs_db.create_run(source_type="upload", status="pending")
    assert r.id
    assert r.status == "pending"
    assert r.source_type == "upload"
    assert r.whisper_model == "base"
    assert r.whisper_device == "auto"
    assert r.whisper_compute_type == "default"


def test_create_run_with_all_fields(db_env) -> None:
    runs_db = db_env
    r = runs_db.create_run(
        source_type="url",
        title="My Video",
        youtube_url="https://youtu.be/abc",
        local_source_path="/tmp/v.mp4",
        source_filename="v.mp4",
        whisper_model="large-v3",
        whisper_device="cuda",
        whisper_compute_type="float16",
        status="running",
        extra={"foo": "bar"},
    )
    assert r.title == "My Video"
    assert r.youtube_url == "https://youtu.be/abc"
    assert r.whisper_model == "large-v3"
    extra = json.loads(r.extra_json)
    assert extra["foo"] == "bar"


def test_get_run_raises_for_unknown_id(db_env) -> None:
    runs_db = db_env
    with pytest.raises(KeyError):
        runs_db.get_run("nonexistent-id")


# ---------------------------------------------------------------------------
# update_run
# ---------------------------------------------------------------------------


def test_update_run_status(db_env) -> None:
    runs_db = db_env
    r = runs_db.create_run(source_type="upload", status="pending")
    runs_db.update_run(r.id, status="completed")
    updated = runs_db.get_run(r.id)
    assert updated.status == "completed"


def test_update_run_step_and_error(db_env) -> None:
    runs_db = db_env
    r = runs_db.create_run(source_type="upload", status="running")
    runs_db.update_run(r.id, step="ingest", error="boom")
    updated = runs_db.get_run(r.id)
    assert updated.step == "ingest"
    assert updated.error == "boom"


def test_update_run_extra(db_env) -> None:
    runs_db = db_env
    r = runs_db.create_run(source_type="upload", status="pending")
    runs_db.update_run(r.id, extra={"key": "val"})
    updated = runs_db.get_run(r.id)
    assert json.loads(updated.extra_json)["key"] == "val"


def test_update_run_no_fields_is_noop(db_env) -> None:
    runs_db = db_env
    r = runs_db.create_run(source_type="upload", status="pending")
    # Calling update with only timestamp is still safe; no crash
    runs_db.update_run(r.id)
    # Status unchanged
    updated = runs_db.get_run(r.id)
    assert updated.status == "pending"


# ---------------------------------------------------------------------------
# list_runs
# ---------------------------------------------------------------------------


def test_list_runs_returns_all(db_env) -> None:
    runs_db = db_env
    runs_db.create_run(source_type="upload", status="pending")
    runs_db.create_run(source_type="url", status="completed")
    all_runs = runs_db.list_runs()
    assert len(all_runs) == 2


def test_list_runs_filter_by_status(db_env) -> None:
    runs_db = db_env
    runs_db.create_run(source_type="upload", status="pending")
    runs_db.create_run(source_type="upload", status="completed")
    pending = runs_db.list_runs(status="pending")
    assert all(r.status == "pending" for r in pending)
    assert len(pending) == 1


def test_list_runs_limit(db_env) -> None:
    runs_db = db_env
    for _ in range(5):
        runs_db.create_run(source_type="upload", status="pending")
    limited = runs_db.list_runs(limit=3)
    assert len(limited) == 3


def test_list_runs_empty(db_env) -> None:
    runs_db = db_env
    assert runs_db.list_runs() == []


# ---------------------------------------------------------------------------
# delete_run
# ---------------------------------------------------------------------------


def test_delete_run_removes_record(db_env) -> None:
    runs_db = db_env
    r = runs_db.create_run(source_type="upload", status="pending")
    runs_db.delete_run(r.id)
    with pytest.raises(KeyError):
        runs_db.get_run(r.id)


def test_delete_nonexistent_run_is_noop(db_env) -> None:
    runs_db = db_env
    # Should not raise
    runs_db.delete_run("ghost-id-that-does-not-exist")


# ---------------------------------------------------------------------------
# get_run_extra_dict
# ---------------------------------------------------------------------------


def test_get_run_extra_dict_empty(db_env) -> None:
    runs_db = db_env
    r = runs_db.create_run(source_type="upload", status="pending")
    assert runs_db.get_run_extra_dict(r.id) == {}


def test_get_run_extra_dict_with_extra(db_env) -> None:
    runs_db = db_env
    r = runs_db.create_run(source_type="upload", status="pending", extra={"a": 1})
    assert runs_db.get_run_extra_dict(r.id) == {"a": 1}


# ---------------------------------------------------------------------------
# merge_run_extra
# ---------------------------------------------------------------------------


def test_merge_run_extra_adds_new_key(db_env) -> None:
    runs_db = db_env
    r = runs_db.create_run(source_type="upload", status="pending", extra={"existing": "val"})
    runs_db.merge_run_extra(r.id, {"new_key": 42})
    ex = runs_db.get_run_extra_dict(r.id)
    assert ex["existing"] == "val"
    assert ex["new_key"] == 42


def test_merge_run_extra_overwrites_existing_key(db_env) -> None:
    runs_db = db_env
    r = runs_db.create_run(source_type="upload", status="pending", extra={"k": "old"})
    runs_db.merge_run_extra(r.id, {"k": "new"})
    ex = runs_db.get_run_extra_dict(r.id)
    assert ex["k"] == "new"


# ---------------------------------------------------------------------------
# to_dict
# ---------------------------------------------------------------------------


def test_run_record_to_dict_camel_case(db_env) -> None:
    runs_db = db_env
    r = runs_db.create_run(
        source_type="upload",
        status="pending",
        title="Test",
        extra={"x": 1},
    )
    d = r.to_dict()
    assert d["sourceType"] == "upload"
    assert d["whisperModel"] == "base"
    assert d["extra"] == {"x": 1}
    assert d["title"] == "Test"
    assert "id" in d
    assert "createdAt" in d
