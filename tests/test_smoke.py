"""Smoke tests: import package and core models."""

from __future__ import annotations

import clip_engine
from clip_engine.models import CutPlan, TranscriptDoc


def test_version() -> None:
    assert hasattr(clip_engine, "__version__")


def test_models_roundtrip() -> None:
    doc = TranscriptDoc(source_video="x.mp4", duration_s=120.0, segments=[])
    s = doc.model_dump_json()
    assert TranscriptDoc.model_validate_json(s).duration_s == 120.0
    plan = CutPlan(longform_clips=[], shortform_clips=[])
    assert CutPlan.model_validate_json(plan.model_dump_json()).longform_clips == []
