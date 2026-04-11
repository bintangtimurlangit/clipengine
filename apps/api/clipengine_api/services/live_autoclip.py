"""Phase 3 — automatic clip detection from a live buffer (design hooks; not wired in MVP).

Rolling-buffer scoring, enqueue policy, and catalog/automation integration belong here.
The manual YouTube Live path records to ``source.*`` then runs the normal pipeline; this module
is reserved for future **autoclip** behavior described in ``docs/youtube-live.md``.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class LiveAutoclipPolicy:
    """Tunable limits when autoclip is implemented (env-backed later)."""

    max_clips_per_hour: int = 6
    min_gap_seconds: int = 120
    chunk_transcript_seconds: int = 90


def should_enqueue_autoclip(
    *,
    policy: LiveAutoclipPolicy,
    clips_this_hour: int,
    seconds_since_last_clip: float,
) -> bool:
    """Return whether a candidate moment should enqueue a clip job (Phase 3).

    MVP always returns ``False`` — no rolling buffer or scorer is connected yet.
    """
    del policy, clips_this_hour, seconds_since_last_clip
    return False


def enqueue_autoclip_candidate_placeholder() -> None:
    """Reserved for Phase 3: enqueue ``POST /api/runs`` or internal segment jobs from the buffer."""
    raise NotImplementedError(
        "Autoclip enqueue is not implemented — use manual YouTube Live record, then start the pipeline.",
    )
