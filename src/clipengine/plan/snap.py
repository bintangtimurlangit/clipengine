"""Snap clip boundaries to Whisper segment edges so FFmpeg never cuts mid-utterance."""

from __future__ import annotations

import os

from clipengine.models import ClipItem, TranscriptSegment, TranscriptDoc

_EPS = 1e-4


def _slack_s() -> float:
    """Give-or-take seconds vs planner min/max after snapping (default 3)."""
    raw = os.environ.get("clipengine_SNAP_DURATION_SLACK_S")
    if raw is None or not str(raw).strip():
        return 3.0
    return float(str(raw).strip())


def _strictly_inside_segment(t: float, segments: list[TranscriptSegment]) -> TranscriptSegment | None:
    """Return segment where seg.start < t < seg.end (mid-utterance)."""
    for seg in segments:
        if seg.start + _EPS < t < seg.end - _EPS:
            return seg
    return None


def _snap_start(start_s: float, segments: list[TranscriptSegment]) -> float:
    """If start falls mid-utterance, move to that segment's start."""
    seg = _strictly_inside_segment(start_s, segments)
    return seg.start if seg is not None else start_s


def _snap_end(end_s: float, segments: list[TranscriptSegment]) -> float:
    """If end falls mid-utterance, extend to that segment's end (full line / breath)."""
    seg = _strictly_inside_segment(end_s, segments)
    return seg.end if seg is not None else end_s


def _best_end_before_cap(
    start_s: float,
    cap_s: float,
    segments: list[TranscriptSegment],
    video_duration_s: float,
) -> float | None:
    """
    Latest time ``t`` such that ``t <= cap_s``, ``t > start_s``, and ``t`` is not
    strictly inside a segment's interior (segment ends and silence are OK).
    """
    cap_s = min(cap_s, video_duration_s)
    if cap_s <= start_s:
        return None

    ends = [s.end for s in segments if s.end > start_s and s.end <= cap_s + _EPS]
    inside = _strictly_inside_segment(cap_s, segments)
    if inside is None:
        candidates = ends + [cap_s]
    else:
        candidates = ends

    valid = [t for t in candidates if t > start_s and t <= cap_s + _EPS]
    if not valid:
        return None
    return max(valid)


def snap_clip_to_transcript(
    clip: ClipItem,
    doc: TranscriptDoc,
    *,
    min_duration_s: float,
    max_duration_s: float,
    video_duration_s: float,
) -> ClipItem:
    """
    Adjust ``start_s`` / ``end_s`` using ingest transcript segments (faster-whisper).

    Boundaries that would split a segment are moved: start to the segment start, end to
    the segment end. Planner min/max are **hints** only: after snapping, duration may
    differ by a few seconds (see ``clipengine_SNAP_DURATION_SLACK_S``, default 3).

    If still far over ``max + slack``, the end is trimmed to the best segment-aligned
    point before that cap; if no such point exists, the snapped window is kept anyway
    (no skipping clips).

    ``max_duration_s`` plus slack sets a **soft** upper trim; ``min_duration_s`` is not
    enforced (LLM ranges may shift slightly after snapping).
    """
    _ = min_duration_s
    slack = _slack_s()
    soft_max = max_duration_s + slack

    segs = sorted(doc.segments, key=lambda s: (s.start, s.end))
    if not segs:
        return clip

    start_s = max(0.0, min(clip.start_s, video_duration_s))
    end_s = max(0.0, min(clip.end_s, video_duration_s))
    if end_s <= start_s + _EPS:
        return clip

    start_s = _snap_start(start_s, segs)
    end_s = _snap_end(end_s, segs)
    start_s = max(0.0, min(start_s, video_duration_s))
    end_s = max(0.0, min(end_s, video_duration_s))
    if end_s <= start_s + _EPS:
        return clip

    # Soft trim only if clearly longer than planner max + slack; never drop below min by rejecting.
    if end_s - start_s > soft_max + _EPS:
        new_end = _best_end_before_cap(start_s, start_s + soft_max, segs, video_duration_s)
        if new_end is not None and new_end > start_s:
            end_s = new_end

    if end_s <= start_s + _EPS:
        return clip

    return ClipItem(
        start_s=start_s,
        end_s=end_s,
        title=clip.title,
        rationale=clip.rationale,
        publish_description=clip.publish_description,
    )
