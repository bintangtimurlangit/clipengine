"""Tests for clipengine.plan.snap — segment boundary snapping."""

from __future__ import annotations

from clipengine.models import ClipItem, TranscriptDoc, TranscriptSegment
from clipengine.plan.snap import (
    _best_end_before_cap,
    _snap_end,
    _snap_start,
    snap_clip_to_transcript,
)


def _segs(*spans: tuple[float, float]) -> list[TranscriptSegment]:
    return [TranscriptSegment(start=s, end=e, text="x") for s, e in spans]


def _doc(*spans: tuple[float, float], duration: float = 600.0) -> TranscriptDoc:
    return TranscriptDoc(
        source_video="v.mp4",
        duration_s=duration,
        segments=_segs(*spans),
    )


def _clip(start: float, end: float) -> ClipItem:
    return ClipItem(start_s=start, end_s=end, title="T", rationale="R")


# ---------------------------------------------------------------------------
# _snap_start
# ---------------------------------------------------------------------------


def test_snap_start_at_boundary_unchanged() -> None:
    segs = _segs((10.0, 20.0))
    assert _snap_start(10.0, segs) == 10.0


def test_snap_start_mid_utterance_snapped_to_seg_start() -> None:
    segs = _segs((10.0, 20.0))
    assert _snap_start(15.0, segs) == 10.0


def test_snap_start_in_silence_unchanged() -> None:
    segs = _segs((10.0, 20.0), (30.0, 40.0))
    assert _snap_start(25.0, segs) == 25.0


# ---------------------------------------------------------------------------
# _snap_end
# ---------------------------------------------------------------------------


def test_snap_end_at_boundary_unchanged() -> None:
    segs = _segs((10.0, 20.0))
    assert _snap_end(20.0, segs) == 20.0


def test_snap_end_mid_utterance_extended_to_seg_end() -> None:
    segs = _segs((10.0, 20.0))
    assert _snap_end(15.0, segs) == 20.0


def test_snap_end_in_silence_unchanged() -> None:
    segs = _segs((10.0, 20.0), (30.0, 40.0))
    assert _snap_end(25.0, segs) == 25.0


# ---------------------------------------------------------------------------
# _best_end_before_cap
# ---------------------------------------------------------------------------


def test_best_end_before_cap_returns_latest_seg_end() -> None:
    segs = _segs((0.0, 10.0), (10.0, 20.0), (20.0, 30.0))
    # cap=25 is strictly inside segment (20,30), so cap itself doesn't qualify.
    # Valid seg ends <= 25+eps: 10, 20. Latest is 20.
    result = _best_end_before_cap(0.0, 25.0, segs, 600.0)
    assert result == 20.0


def test_best_end_before_cap_cap_in_segment_uses_seg_end() -> None:
    segs = _segs((0.0, 10.0), (15.0, 25.0))
    # cap=22 is strictly inside (15, 25), so 22 itself doesn't qualify
    result = _best_end_before_cap(0.0, 22.0, segs, 600.0)
    assert result == 10.0  # latest end <= cap outside segments


def test_best_end_before_cap_none_when_no_valid_end() -> None:
    segs = _segs((0.0, 50.0))  # entire range inside one segment
    # start=0, cap=30, cap is strictly inside (0,50)
    # only seg ends ≤ 30 are none (50 > 30), no silence at cap either
    result = _best_end_before_cap(0.0, 30.0, segs, 600.0)
    assert result is None


def test_best_end_before_cap_returns_none_when_cap_le_start() -> None:
    segs = _segs((10.0, 20.0))
    result = _best_end_before_cap(30.0, 20.0, segs, 600.0)
    assert result is None


# ---------------------------------------------------------------------------
# snap_clip_to_transcript
# ---------------------------------------------------------------------------


def test_snap_clip_no_segments_returns_original() -> None:
    doc = TranscriptDoc(source_video="v.mp4", duration_s=600.0, segments=[])
    clip = _clip(10.0, 200.0)
    result = snap_clip_to_transcript(clip, doc, min_duration_s=0, max_duration_s=360, video_duration_s=600.0)
    assert result.start_s == 10.0
    assert result.end_s == 200.0


def test_snap_clip_boundaries_outside_utterances_unchanged() -> None:
    doc = _doc((5.0, 15.0), (20.0, 30.0))
    clip = _clip(0.0, 32.0)
    result = snap_clip_to_transcript(clip, doc, min_duration_s=0, max_duration_s=360, video_duration_s=600.0)
    assert result.start_s == 0.0
    assert result.end_s == 32.0


def test_snap_clip_start_mid_utterance_moved_to_seg_start() -> None:
    doc = _doc((10.0, 20.0), (25.0, 35.0))
    clip = _clip(13.0, 40.0)
    result = snap_clip_to_transcript(clip, doc, min_duration_s=0, max_duration_s=360, video_duration_s=600.0)
    assert result.start_s == 10.0


def test_snap_clip_end_mid_utterance_extended_to_seg_end() -> None:
    doc = _doc((10.0, 20.0), (25.0, 35.0))
    clip = _clip(0.0, 28.0)
    result = snap_clip_to_transcript(clip, doc, min_duration_s=0, max_duration_s=360, video_duration_s=600.0)
    assert result.end_s == 35.0


def test_snap_clip_clamps_to_video_duration() -> None:
    doc = _doc((0.0, 10.0), duration=30.0)
    clip = _clip(0.0, 50.0)
    result = snap_clip_to_transcript(clip, doc, min_duration_s=0, max_duration_s=360, video_duration_s=30.0)
    assert result.end_s <= 30.0


def test_snap_clip_soft_trim_when_over_max_plus_slack() -> None:
    # Build a doc with segments 0-5, 5-10, ..., 0 to 500 in 5s chunks
    spans = [(float(i * 5), float(i * 5 + 5)) for i in range(100)]
    doc = _doc(*spans, duration=600.0)
    clip = _clip(0.0, 500.0)
    # max=100, slack=3 → soft_max=103; clip is 500s so should be trimmed
    result = snap_clip_to_transcript(
        clip, doc, min_duration_s=0, max_duration_s=100, video_duration_s=600.0
    )
    assert result.end_s - result.start_s <= 106.0  # trimmed to ≤ max+slack+fudge


def test_snap_clip_inverted_after_clamp_returns_original() -> None:
    """If end <= start after clamping, return clip unchanged."""
    doc = _doc((0.0, 5.0))
    clip = _clip(30.0, 30.0)  # end == start
    result = snap_clip_to_transcript(clip, doc, min_duration_s=0, max_duration_s=360, video_duration_s=600.0)
    assert result.start_s == 30.0
    assert result.end_s == 30.0


def test_snap_clip_preserves_title_and_rationale() -> None:
    doc = _doc((0.0, 10.0))
    clip = ClipItem(start_s=0.0, end_s=50.0, title="My Title", rationale="My Reason")
    result = snap_clip_to_transcript(clip, doc, min_duration_s=0, max_duration_s=360, video_duration_s=600.0)
    assert result.title == "My Title"
    assert result.rationale == "My Reason"
