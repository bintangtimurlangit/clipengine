"""Tests for clipengine_api.services.publish_metadata."""

from __future__ import annotations

from pathlib import Path

import pytest

from clipengine.models import ClipItem, CutPlan


def test_resolve_publish_title_ai_clip() -> None:
    from clipengine_api.services.publish_metadata import resolve_publish_title

    c = ClipItem(
        start_s=0,
        end_s=10,
        title="  My Cool Title  ",
        rationale="x",
        publish_description="",
    )
    t = resolve_publish_title(
        c,
        run_title="Run",
        artifact_rel="rendered/longform/a.mp4",
        publish_title_source="ai_clip",
    )
    assert t == "My Cool Title"


def test_resolve_publish_title_run_filename() -> None:
    from clipengine_api.services.publish_metadata import resolve_publish_title

    c = ClipItem(
        start_s=0,
        end_s=10,
        title="Ignored",
        rationale="x",
        publish_description="",
    )
    t = resolve_publish_title(
        c,
        run_title="Episode 1",
        artifact_rel="rendered/shortform/clip_02.mp4",
        publish_title_source="run_filename",
    )
    assert "Episode 1" in t
    assert "clip_02" in t


def test_resolve_publish_description_modes() -> None:
    from clipengine_api.services.publish_metadata import resolve_publish_description

    c = ClipItem(
        start_s=0,
        end_s=10,
        title="t",
        rationale="long rationale",
        publish_description="AI body text",
    )
    assert (
        resolve_publish_description(
            c,
            publish_description_mode="full_ai",
            publish_description_prefix="PRE",
            publish_description_suffix="SUF",
            publish_hybrid_include_ai=True,
        )
        == "AI body text"
    )
    assert (
        resolve_publish_description(
            c,
            publish_description_mode="manual",
            publish_description_prefix="Line1",
            publish_description_suffix="#tag",
            publish_hybrid_include_ai=True,
        )
        == "Line1\n\n#tag"
    )
    hybrid = resolve_publish_description(
        c,
        publish_description_mode="hybrid",
        publish_description_prefix="Intro",
        publish_description_suffix="#end",
        publish_hybrid_include_ai=True,
    )
    assert "Intro" in hybrid
    assert "AI body text" in hybrid
    assert "#end" in hybrid


def test_metadata_json_for_artifact(tmp_path: Path, monkeypatch) -> None:
    from clipengine_api.services import publish_metadata as pm

    rd = tmp_path / "run1"
    (rd / "rendered/longform").mkdir(parents=True)
    (rd / "rendered/longform/0001.mp4").write_bytes(b"")
    plan = CutPlan(
        longform_clips=[
            ClipItem(
                start_s=0,
                end_s=60,
                title="LF",
                rationale="why",
                publish_description="Public text",
            )
        ],
        shortform_clips=[],
    )
    (rd / "cut_plan.json").write_text(plan.model_dump_json(indent=2), encoding="utf-8")

    def fake_load() -> dict:
        return {
            "publish_title_source": "ai_clip",
            "publish_description_mode": "full_ai",
            "publish_description_prefix": "",
            "publish_description_suffix": "",
            "publish_hybrid_include_ai": True,
        }

    monkeypatch.setattr(pm, "load_publish_settings", fake_load)
    meta = pm.metadata_json_for_artifact(rd, "My Run", "rendered/longform/0001.mp4")
    assert meta["publishTitle"] == "LF"
    assert meta["publishDescription"] == "Public text"


@pytest.fixture()
def in_memory_db(tmp_path, monkeypatch):
    monkeypatch.setenv("CLIPENGINE_DATA_DIR", str(tmp_path))
    from clipengine_api.core import db as db_module

    db_module.init_db()
    return tmp_path


def test_settings_roundtrip_publish_defaults(in_memory_db) -> None:
    from clipengine_api.core import db
    from clipengine_api.services.publish_metadata import load_publish_settings, merge_publish_from_stored

    assert load_publish_settings()["publish_description_mode"] == "hybrid"

    raw = db.get_llm_settings_json()
    assert raw is None or raw == "{}"
    stored = merge_publish_from_stored({})
    assert stored["publish_title_source"] == "ai_clip"
