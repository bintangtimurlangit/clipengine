"""Tests for run extra_json merge helpers."""

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


def test_merge_run_extra_preserves_other_keys(in_memory_runs) -> None:
    from clipengine_api.storage import runs_db

    r = runs_db.create_run(source_type="upload", status="pending", extra={"foo": 1})
    runs_db.merge_run_extra(r.id, {"outputDestination": {"kind": "workspace"}})
    again = runs_db.get_run(r.id)
    ex = again.extra_json and json.loads(again.extra_json)
    assert ex["foo"] == 1
    assert ex["outputDestination"]["kind"] == "workspace"


def test_list_automated_runs_excludes_workspace(in_memory_runs) -> None:
    from clipengine_api.storage import runs_db

    a = runs_db.create_run(source_type="upload", status="ready")
    runs_db.merge_run_extra(a.id, {"outputDestination": {"kind": "workspace"}})
    b = runs_db.create_run(source_type="upload", status="ready")
    runs_db.merge_run_extra(b.id, {"outputDestination": {"kind": "youtube", "youtubePrivacy": "private"}})
    c = runs_db.create_run(source_type="upload", status="ready")
    # no outputDestination
    auto = runs_db.list_automated_runs(limit=50)
    ids = {r.id for r in auto}
    assert b.id in ids
    assert a.id not in ids
    assert c.id not in ids
