"""Shared duration bounds for the cut planner and renderer.

Values are read from environment variables on each access so the API can
overlay SQLite-backed settings onto ``os.environ`` before a pipeline run.
"""

from __future__ import annotations

import os


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or not str(raw).strip():
        return default
    return float(str(raw).strip())


def longform_min_duration_s() -> float:
    """Enforced in sanitize_cut_plan (after timestamp clamping). Default 180s (3 minutes)."""
    return _env_float("clipengine_LONGFORM_MIN_S", 180.0)


def longform_max_duration_s() -> float:
    """Default 360s (6 minutes)."""
    return _env_float("clipengine_LONGFORM_MAX_S", 360.0)


def shortform_min_duration_s() -> float:
    return _env_float("clipengine_SHORTFORM_MIN_S", 27.0)


def shortform_max_duration_s() -> float:
    """~1 minute cap with headroom for natural cuts (e.g. 1:05–1:20)."""
    return _env_float("clipengine_SHORTFORM_MAX_S", 80.0)
