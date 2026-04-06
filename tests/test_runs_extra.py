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
    runs_db.merge_run_extra(r.id, {"outputDestination": {"kind": "temp_12h"}})
    again = runs_db.get_run(r.id)
    ex = again.extra_json and json.loads(again.extra_json)
    assert ex["foo"] == 1
    assert ex["outputDestination"]["kind"] == "temp_12h"
