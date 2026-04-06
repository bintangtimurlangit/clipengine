"""Tests for pipeline settings merge and effective upload limit."""

from __future__ import annotations

import json
from pathlib import Path

import pytest


def test_pipeline_settings_effective_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("clipengine_LONGFORM_MIN_S", raising=False)
    monkeypatch.delenv("clipengine_LONGFORM_MAX_S", raising=False)
    from clipengine_api.core.env import (
        DEFAULT_LONGFORM_MIN_S,
        DEFAULT_MAX_UPLOAD_BYTES,
        pipeline_settings_effective,
    )

    p = pipeline_settings_effective({})
    assert p["longformMinS"] == DEFAULT_LONGFORM_MIN_S
    assert p["maxUploadBytes"] == DEFAULT_MAX_UPLOAD_BYTES


def test_pipeline_settings_effective_stored_overrides_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("clipengine_LONGFORM_MIN_S", "100")
    from clipengine_api.core.env import pipeline_settings_effective

    p = pipeline_settings_effective({"longform_min_s": 200})
    assert p["longformMinS"] == 200


def test_effective_max_upload_bytes_from_sqlite(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("CLIPENGINE_DATA_DIR", str(tmp_path))
    from clipengine_api.core import db

    db.init_db()
    db.save_llm_settings_json(json.dumps({"max_upload_bytes": 10 * 1024 * 1024}))

    from clipengine_api.core.env import effective_max_upload_bytes

    assert effective_max_upload_bytes() == 10 * 1024 * 1024


def test_apply_stored_llm_env_sets_pipeline_vars(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("CLIPENGINE_DATA_DIR", str(tmp_path))
    from clipengine_api.core import db

    db.init_db()
    db.save_llm_settings_json(
        json.dumps(
            {
                "longform_min_s": 190,
                "snap_duration_slack_s": 4.5,
            }
        )
    )

    from clipengine_api.core.env import apply_stored_llm_env

    apply_stored_llm_env()
    import os

    assert float(os.environ["clipengine_LONGFORM_MIN_S"]) == 190.0
    assert float(os.environ["clipengine_SNAP_DURATION_SLACK_S"]) == 4.5
