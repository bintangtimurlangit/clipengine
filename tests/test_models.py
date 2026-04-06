"""Tests for clipengine.models Pydantic validation and constraints."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from clipengine.models import (
    ClipItem,
    CutPlan,
    RenderPreset,
    TranscriptDoc,
    TranscriptSegment,
    VideoPlanningFoundation,
)


# ---------------------------------------------------------------------------
# TranscriptSegment
# ---------------------------------------------------------------------------


def test_transcript_segment_basic() -> None:
    seg = TranscriptSegment(start=0.0, end=5.0, text="Hello")
    assert seg.start == 0.0
    assert seg.end == 5.0
    assert seg.text == "Hello"


def test_transcript_segment_default_text() -> None:
    seg = TranscriptSegment(start=1.0, end=2.0)
    assert seg.text == ""


def test_transcript_segment_rejects_negative_start() -> None:
    with pytest.raises(ValidationError):
        TranscriptSegment(start=-1.0, end=5.0)


def test_transcript_segment_rejects_negative_end() -> None:
    with pytest.raises(ValidationError):
        TranscriptSegment(start=0.0, end=-1.0)


# ---------------------------------------------------------------------------
# TranscriptDoc
# ---------------------------------------------------------------------------


def test_transcript_doc_defaults() -> None:
    doc = TranscriptDoc(source_video="vid.mp4", duration_s=60.0)
    assert doc.segments == []
    assert doc.language is None
    assert doc.whisper_model is None


def test_transcript_doc_rejects_negative_duration() -> None:
    with pytest.raises(ValidationError):
        TranscriptDoc(source_video="vid.mp4", duration_s=-1.0)


def test_transcript_doc_roundtrip() -> None:
    doc = TranscriptDoc(
        source_video="ep1.mp4",
        duration_s=3600.0,
        language="en",
        segments=[TranscriptSegment(start=0.0, end=1.5, text="hi")],
        whisper_model="large-v3",
    )
    j = doc.model_dump_json()
    doc2 = TranscriptDoc.model_validate_json(j)
    assert doc2.source_video == "ep1.mp4"
    assert doc2.duration_s == 3600.0
    assert doc2.language == "en"
    assert len(doc2.segments) == 1
    assert doc2.segments[0].text == "hi"
    assert doc2.whisper_model == "large-v3"


# ---------------------------------------------------------------------------
# ClipItem
# ---------------------------------------------------------------------------


def test_clip_item_defaults() -> None:
    clip = ClipItem(start_s=10.0, end_s=70.0)
    assert clip.title == ""
    assert clip.rationale == ""


def test_clip_item_rejects_negative_start() -> None:
    with pytest.raises(ValidationError):
        ClipItem(start_s=-5.0, end_s=10.0)


def test_clip_item_with_metadata() -> None:
    clip = ClipItem(start_s=0.0, end_s=60.0, title="Intro", rationale="Good hook")
    assert clip.title == "Intro"
    assert clip.rationale == "Good hook"


# ---------------------------------------------------------------------------
# CutPlan
# ---------------------------------------------------------------------------


def test_cut_plan_defaults() -> None:
    plan = CutPlan()
    assert plan.longform_clips == []
    assert plan.shortform_clips == []
    assert plan.notes is None
    assert plan.editorial_summary is None
    assert plan.planning_foundation is None


def test_cut_plan_roundtrip() -> None:
    plan = CutPlan(
        longform_clips=[ClipItem(start_s=0.0, end_s=200.0, title="Scene 1")],
        shortform_clips=[ClipItem(start_s=30.0, end_s=60.0, title="Clip A")],
        notes="some notes",
    )
    plan2 = CutPlan.model_validate_json(plan.model_dump_json())
    assert len(plan2.longform_clips) == 1
    assert plan2.longform_clips[0].title == "Scene 1"
    assert len(plan2.shortform_clips) == 1
    assert plan2.notes == "some notes"


# ---------------------------------------------------------------------------
# VideoPlanningFoundation
# ---------------------------------------------------------------------------


def test_video_planning_foundation_defaults() -> None:
    vpf = VideoPlanningFoundation()
    assert vpf.foundation_summary == ""
    assert vpf.identity_search_query == ""
    assert vpf.highlights_search_query == ""
    assert vpf.tavily_identity_excerpt is None
    assert vpf.tavily_highlights_excerpt is None


def test_video_planning_foundation_populated() -> None:
    vpf = VideoPlanningFoundation(
        foundation_summary="Podcast ep 5",
        identity_search_query="q1",
        highlights_search_query="q2",
        tavily_identity_excerpt="id excerpt",
        tavily_highlights_excerpt="hi excerpt",
    )
    assert vpf.tavily_identity_excerpt == "id excerpt"


# ---------------------------------------------------------------------------
# RenderPreset
# ---------------------------------------------------------------------------


def test_render_preset_longform() -> None:
    p = RenderPreset(kind="longform", width=1920, height=1080)
    assert p.kind == "longform"


def test_render_preset_shortform() -> None:
    p = RenderPreset(kind="shortform", width=1080, height=1920)
    assert p.kind == "shortform"


def test_render_preset_invalid_kind() -> None:
    with pytest.raises(ValidationError):
        RenderPreset(kind="portrait", width=1080, height=1920)
