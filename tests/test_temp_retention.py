"""Tests for clipengine_api.services.temp_retention."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest


@pytest.fixture()
def retention_env(monkeypatch, tmp_path):
    monkeypatch.setenv("CLIPENGINE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLIPENGINE_WORKSPACE", str(tmp_path / "ws"))
    from clipengine_api.core import db as db_module
    from clipengine_api.storage import runs_db

    db_module.init_db()
    runs_db.init_runs_table()
    return tmp_path


# ---------------------------------------------------------------------------
# _parse_iso_utc
# ---------------------------------------------------------------------------


def test_parse_iso_utc_valid_string(retention_env) -> None:
    from clipengine_api.services.temp_retention import _parse_iso_utc

    dt = _parse_iso_utc("2024-01-15T12:00:00+00:00")
    assert dt is not None
    assert dt.year == 2024
    assert dt.tzinfo is not None


def test_parse_iso_utc_z_suffix(retention_env) -> None:
    from clipengine_api.services.temp_retention import _parse_iso_utc

    dt = _parse_iso_utc("2024-06-01T00:00:00Z")
    assert dt is not None
    assert dt.tzinfo is not None


def test_parse_iso_utc_naive_gets_utc(retention_env) -> None:
    from clipengine_api.services.temp_retention import _parse_iso_utc

    dt = _parse_iso_utc("2024-01-01T00:00:00")
    assert dt is not None
    assert dt.tzinfo is not None


def test_parse_iso_utc_invalid_returns_none(retention_env) -> None:
    from clipengine_api.services.temp_retention import _parse_iso_utc

    assert _parse_iso_utc("not-a-date") is None
    assert _parse_iso_utc("") is None


# ---------------------------------------------------------------------------
# cleanup_expired_runs
# ---------------------------------------------------------------------------


def test_cleanup_expired_runs_removes_expired_workspace(retention_env) -> None:
    from clipengine_api.services.temp_retention import cleanup_expired_runs
    from clipengine_api.storage import runs_db
    from clipengine_api.services.workspace import run_dir

    r = runs_db.create_run(source_type="upload", status="completed")
    past = (datetime.now(UTC) - timedelta(hours=13)).isoformat()
    runs_db.merge_run_extra(r.id, {"retentionExpiresAt": past})

    rd = run_dir(r.id)
    rd.mkdir(parents=True, exist_ok=True)
    (rd / "clip.mp4").write_bytes(b"fake")

    removed = cleanup_expired_runs(now=datetime.now(UTC))
    assert removed == 1
    assert not rd.is_dir()
    rec = runs_db.get_run(r.id)
    assert rec.status == "expired"


def test_cleanup_expired_runs_skips_not_yet_expired(retention_env) -> None:
    from clipengine_api.services.temp_retention import cleanup_expired_runs
    from clipengine_api.storage import runs_db
    from clipengine_api.services.workspace import run_dir

    r = runs_db.create_run(source_type="upload", status="completed")
    future = (datetime.now(UTC) + timedelta(hours=12)).isoformat()
    runs_db.merge_run_extra(r.id, {"retentionExpiresAt": future})

    rd = run_dir(r.id)
    rd.mkdir(parents=True, exist_ok=True)

    removed = cleanup_expired_runs(now=datetime.now(UTC))
    assert removed == 0
    assert rd.is_dir()


def test_cleanup_expired_runs_skips_non_completed_runs(retention_env) -> None:
    from clipengine_api.services.temp_retention import cleanup_expired_runs
    from clipengine_api.storage import runs_db
    from clipengine_api.services.workspace import run_dir

    r = runs_db.create_run(source_type="upload", status="pending")
    past = (datetime.now(UTC) - timedelta(hours=13)).isoformat()
    runs_db.merge_run_extra(r.id, {"retentionExpiresAt": past})

    rd = run_dir(r.id)
    rd.mkdir(parents=True, exist_ok=True)

    removed = cleanup_expired_runs(now=datetime.now(UTC))
    assert removed == 0
    assert rd.is_dir()


def test_cleanup_expired_runs_skips_runs_without_extra(retention_env) -> None:
    from clipengine_api.services.temp_retention import cleanup_expired_runs
    from clipengine_api.storage import runs_db

    runs_db.create_run(source_type="upload", status="completed")
    removed = cleanup_expired_runs(now=datetime.now(UTC))
    assert removed == 0


def test_cleanup_expired_runs_tolerates_missing_directory(retention_env) -> None:
    from clipengine_api.services.temp_retention import cleanup_expired_runs
    from clipengine_api.storage import runs_db

    r = runs_db.create_run(source_type="upload", status="completed")
    past = (datetime.now(UTC) - timedelta(hours=13)).isoformat()
    runs_db.merge_run_extra(r.id, {"retentionExpiresAt": past})
    # Intentionally do NOT create the run_dir

    removed = cleanup_expired_runs(now=datetime.now(UTC))
    assert removed == 1
    rec = runs_db.get_run(r.id)
    assert rec.status == "expired"
