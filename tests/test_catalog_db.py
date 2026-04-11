"""Media catalog SQLite helpers."""

from __future__ import annotations

import pytest


@pytest.fixture()
def api_env(monkeypatch, tmp_path):
    monkeypatch.setenv("CLIPENGINE_DATA_DIR", str(tmp_path))


def test_catalog_upsert_and_list(api_env, tmp_path) -> None:
    from clipengine_api.storage import catalog_db

    catalog_db.init_catalog_table()
    catalog_db.upsert_entry(
        source_kind="local",
        ref_key="local:/tmp/x.mp4",
        display_name="x.mp4",
        relative_path="a/x.mp4",
        extra={"absolutePath": "/tmp/x.mp4"},
    )
    rows = catalog_db.list_entries(source_kind="local", limit=10)
    assert len(rows) == 1
    assert rows[0].display_name == "x.mp4"
    assert rows[0].relative_path == "a/x.mp4"


def test_catalog_delete_prefix(api_env, tmp_path) -> None:
    from clipengine_api.storage import catalog_db

    catalog_db.init_catalog_table()
    catalog_db.upsert_entry(
        source_kind="s3",
        ref_key="s3:bucket:a/b/one.mp4",
        display_name="one.mp4",
        relative_path="a/b/one.mp4",
    )
    n = catalog_db.delete_entries_by_prefix("s3", "s3:bucket:a/")
    assert n >= 1
    rows = catalog_db.list_entries(source_kind="s3", limit=10)
    assert len(rows) == 0
