"""Cut plan without an LLM: time-based windows, then sanitize like normal plans."""

from __future__ import annotations

import math

from clipengine.config import (
    longform_max_duration_s,
    longform_min_duration_s,
    shortform_max_duration_s,
    shortform_min_duration_s,
)
from clipengine.models import ClipItem, CutPlan, TranscriptDoc
from clipengine.plan.llm import sanitize_cut_plan


def _longform_windows(duration_s: float) -> list[tuple[float, float]]:
    lf_min = longform_min_duration_s()
    lf_max = longform_max_duration_s()
    if duration_s < lf_min:
        return []
    n = max(1, int(math.ceil(duration_s / lf_max)))
    chunk = duration_s / n
    while chunk < lf_min and n > 1:
        n -= 1
        chunk = duration_s / n
    while chunk > lf_max:
        n += 1
        chunk = duration_s / n
    if chunk < lf_min:
        return []
    out: list[tuple[float, float]] = []
    for i in range(n):
        start = i * chunk
        end = duration_s if i == n - 1 else (i + 1) * chunk
        if end - start >= lf_min - 1e-6:
            out.append((start, end))
    return out


def _shortform_windows(duration_s: float) -> list[tuple[float, float]]:
    sf_min = shortform_min_duration_s()
    sf_max = shortform_max_duration_s()
    if duration_s < sf_min:
        return []
    if duration_s <= sf_max:
        return [(0.0, duration_s)]
    n = 3
    w = min(
        sf_max,
        max(sf_min, duration_s / (n + 2)),
    )
    gap = (duration_s - n * w) / (n + 1)
    if gap < 0:
        w = sf_max
        gap = max(0.0, (duration_s - n * w) / (n + 1))
    out: list[tuple[float, float]] = []
    t = gap
    for _ in range(n):
        if t + w > duration_s + 1e-6:
            break
        end = min(t + w, duration_s)
        if end - t >= sf_min - 1e-6:
            out.append((t, end))
        t = end + gap
    return out


def build_heuristic_cut_plan(doc: TranscriptDoc) -> CutPlan:
    dur = doc.duration_s
    longs = [
        ClipItem(
            start_s=a,
            end_s=b,
            title=f"Longform {i}",
            rationale="Heuristic time window (no LLM).",
        )
        for i, (a, b) in enumerate(_longform_windows(dur), start=1)
    ]
    shorts = [
        ClipItem(
            start_s=a,
            end_s=b,
            title=f"Short {i}",
            rationale="Heuristic time window (no LLM).",
        )
        for i, (a, b) in enumerate(_shortform_windows(dur), start=1)
    ]
    raw = CutPlan(
        longform_clips=longs,
        shortform_clips=shorts,
        notes="Heuristic cut plan (no LLM). Clips use simple time windows.",
        editorial_summary=None,
        planning_foundation=None,
    )
    return sanitize_cut_plan(raw, dur)
