"""Tests for ASS burn-in subtitle helpers."""

from clipengine.models import TranscriptDoc, TranscriptSegment
from clipengine.render.subtitles import (
    SubtitleStyle,
    build_ass_for_clip,
    segments_for_clip_window,
)


def test_segments_for_clip_window_shifts_times() -> None:
    doc = TranscriptDoc(
        source_video="x.mp4",
        duration_s=100.0,
        segments=[
            TranscriptSegment(start=0.0, end=2.0, text="a"),
            TranscriptSegment(start=5.0, end=8.0, text="b"),
            TranscriptSegment(start=20.0, end=25.0, text="c"),
        ],
    )
    out = segments_for_clip_window(doc, clip_start=4.0, clip_end=10.0)
    assert len(out) == 1
    t0, t1, text = out[0]
    assert abs(t0 - 1.0) < 0.001
    assert abs(t1 - 4.0) < 0.001
    assert text == "b"


def test_build_ass_contains_dialogue() -> None:
    doc = TranscriptDoc(
        source_video="x.mp4",
        duration_s=30.0,
        segments=[TranscriptSegment(start=1.0, end=3.0, text="Hello world")],
    )
    style = SubtitleStyle()
    ass = build_ass_for_clip(doc, 0.0, 10.0, 1920, 1080, style)
    assert "PlayResX: 1920" in ass
    assert "PlayResY: 1080" in ass
    assert "Hello world" in ass
    assert "Dialogue:" in ass
