"""Shared duration/size constants for the cut planner and renderer.

All values are read from environment variables at import time so they can be
overridden in tests or via Docker Compose without changing source code.
"""

from __future__ import annotations

import os


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or not str(raw).strip():
        return default
    return float(str(raw).strip())


# Enforced in sanitize_cut_plan (after timestamp clamping).
LONGFORM_MIN_DURATION_S = _env_float("clipengine_LONGFORM_MIN_S", 180.0)  # 3 minutes
# Keep longform to one or two scenes; multi-scene 10+ minute compilations are rejected.
LONGFORM_MAX_DURATION_S = _env_float("clipengine_LONGFORM_MAX_S", 360.0)  # 6 minutes
SHORTFORM_MIN_DURATION_S = _env_float("clipengine_SHORTFORM_MIN_S", 27.0)
# ~1 minute cap with headroom for natural cuts (e.g. 1:05–1:20).
SHORTFORM_MAX_DURATION_S = _env_float("clipengine_SHORTFORM_MAX_S", 80.0)
