"""Delete run workspaces after temporary (12h) retention expires."""

from __future__ import annotations

import json
import logging
import shutil
from datetime import datetime, timezone
from typing import Any

from clipengine_api.services.workspace import run_dir
from clipengine_api.storage import runs_db

log = logging.getLogger(__name__)


def _parse_iso_utc(s: str) -> datetime | None:
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def cleanup_expired_runs(*, now: datetime | None = None) -> int:
    """Remove workspace folders for completed runs past ``retentionExpiresAt``.

    Returns the number of runs expired.
    """
    now = now or datetime.now(timezone.utc)
    removed = 0
    for rec in runs_db.list_runs(limit=500):
        if rec.status != "completed":
            continue
        if not rec.extra_json:
            continue
        try:
            extra: dict[str, Any] = json.loads(rec.extra_json)
        except json.JSONDecodeError:
            continue
        expires = extra.get("retentionExpiresAt")
        if not isinstance(expires, str):
            continue
        exp_dt = _parse_iso_utc(expires)
        if exp_dt is None or now <= exp_dt:
            continue

        rd = run_dir(rec.id)
        if rd.is_dir():
            shutil.rmtree(rd, ignore_errors=True)
        runs_db.update_run(
            rec.id,
            status="expired",
            error="Removed after 12-hour temporary storage period.",
        )
        removed += 1
        log.info("Expired temp storage for run %s", rec.id)
    return removed
