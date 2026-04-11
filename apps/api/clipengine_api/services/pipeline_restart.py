"""Reset a finished run to ``ready`` by clearing pipeline outputs (keeps source video)."""

from __future__ import annotations

import shutil
from pathlib import Path

from clipengine_api.storage import runs_db
from clipengine_api.services.workspace import run_dir

_RESTARTABLE_STATUSES = frozenset({"completed", "failed", "cancelled"})

# Known ingest/plan/render outputs only — never delete source video or arbitrary files.
_PIPELINE_ARTIFACT_FILES: tuple[str, ...] = (
    "audio_16k_mono.wav",
    "transcript.json",
    "segments.vtt",
    "cut_plan.json",
    "llm_activity.log",
    "plan_activity.json",
    "render_activity.json",
    "yt-dlp.log",
)


def clear_pipeline_artifacts(rd: Path) -> None:
    """Remove pipeline-generated files and ``rendered/`` under a run workspace."""
    rd = rd.resolve()
    if not rd.is_dir():
        return
    for name in _PIPELINE_ARTIFACT_FILES:
        p = rd / name
        if p.is_file():
            p.unlink()
    rendered = rd / "rendered"
    if rendered.is_dir():
        shutil.rmtree(rendered, ignore_errors=True)


def restart_run_to_ready(run_id: str) -> None:
    """
    Clear pipeline artifacts, drop stale completion metadata, set status to ``ready``.

    Raises:
        KeyError: run does not exist.
        ValueError: run status is not restartable (only completed / failed / cancelled).
    """
    rec = runs_db.get_run(run_id)
    if rec.status not in _RESTARTABLE_STATUSES:
        raise ValueError(
            f"Run cannot be restarted (status: {rec.status}); "
            "only completed, failed, or cancelled runs can be reset."
        )
    clear_pipeline_artifacts(run_dir(run_id))
    extra = runs_db.get_run_extra_dict(run_id)
    extra.pop("publishedYoutube", None)
    runs_db.update_run(run_id, extra=extra)
    runs_db.revert_run_to_ready(run_id)
