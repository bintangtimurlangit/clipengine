"""Heuristic cut plan (no LLM)."""

from clipengine.models import TranscriptDoc, TranscriptSegment
from clipengine.plan.heuristic import build_heuristic_cut_plan


def test_heuristic_produces_clips_for_long_video() -> None:
    doc = TranscriptDoc(
        source_video="x.mp4",
        duration_s=600.0,
        segments=[
            TranscriptSegment(start=0.0, end=60.0, text="a"),
            TranscriptSegment(start=60.0, end=120.0, text="b"),
        ],
    )
    plan = build_heuristic_cut_plan(doc)
    assert len(plan.longform_clips) >= 1
    assert len(plan.shortform_clips) >= 1
    for c in plan.longform_clips + plan.shortform_clips:
        assert c.end_s > c.start_s


def test_heuristic_short_video_only_shortform() -> None:
    doc = TranscriptDoc(
        source_video="x.mp4",
        duration_s=60.0,
        segments=[],
    )
    plan = build_heuristic_cut_plan(doc)
    assert len(plan.longform_clips) == 0
    assert len(plan.shortform_clips) == 1
