"""Pipeline run persistence (SQLite)."""

from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from clipengine_api.core.db import connect, init_db as init_app_settings


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def init_runs_table() -> None:
    init_app_settings()
    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS pipeline_runs (
                id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                step TEXT,
                source_type TEXT NOT NULL,
                title TEXT,
                youtube_url TEXT,
                local_source_path TEXT,
                source_filename TEXT,
                whisper_model TEXT NOT NULL DEFAULT 'base',
                whisper_device TEXT NOT NULL DEFAULT 'auto',
                whisper_compute_type TEXT NOT NULL DEFAULT 'default',
                error TEXT,
                extra_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


@dataclass
class RunRecord:
    id: str
    status: str
    step: str | None
    source_type: str
    title: str | None
    youtube_url: str | None
    local_source_path: str | None
    source_filename: str | None
    whisper_model: str
    whisper_device: str
    whisper_compute_type: str
    error: str | None
    extra_json: str | None
    created_at: str
    updated_at: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "status": self.status,
            "step": self.step,
            "sourceType": self.source_type,
            "title": self.title,
            "youtubeUrl": self.youtube_url,
            "localSourcePath": self.local_source_path,
            "sourceFilename": self.source_filename,
            "whisperModel": self.whisper_model,
            "whisperDevice": self.whisper_device,
            "whisperComputeType": self.whisper_compute_type,
            "error": self.error,
            "extra": json.loads(self.extra_json) if self.extra_json else None,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }


def _row_to_run(row: sqlite3.Row) -> RunRecord:
    return RunRecord(
        id=row["id"],
        status=row["status"],
        step=row["step"],
        source_type=row["source_type"],
        title=row["title"],
        youtube_url=row["youtube_url"],
        local_source_path=row["local_source_path"],
        source_filename=row["source_filename"],
        whisper_model=row["whisper_model"],
        whisper_device=row["whisper_device"],
        whisper_compute_type=row["whisper_compute_type"],
        error=row["error"],
        extra_json=row["extra_json"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def create_run(
    *,
    source_type: str,
    title: str | None = None,
    youtube_url: str | None = None,
    local_source_path: str | None = None,
    source_filename: str | None = None,
    whisper_model: str = "base",
    whisper_device: str = "auto",
    whisper_compute_type: str = "default",
    status: str = "pending",
    extra: dict[str, Any] | None = None,
) -> RunRecord:
    init_runs_table()
    rid = str(uuid.uuid4())
    ts = _now_iso()
    extra_json = json.dumps(extra) if extra else None
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO pipeline_runs (
                id, status, step, source_type, title, youtube_url, local_source_path,
                source_filename, whisper_model, whisper_device, whisper_compute_type,
                error, extra_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                rid,
                status,
                None,
                source_type,
                title,
                youtube_url,
                local_source_path,
                source_filename,
                whisper_model,
                whisper_device,
                whisper_compute_type,
                None,
                extra_json,
                ts,
                ts,
            ),
        )
        conn.commit()
    return get_run(rid)


def update_run(
    run_id: str,
    *,
    status: str | None = None,
    step: str | None = None,
    error: str | None = None,
    title: str | None = None,
    youtube_url: str | None = None,
    local_source_path: str | None = None,
    source_filename: str | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    init_runs_table()
    fields: list[str] = []
    vals: list[Any] = []
    if status is not None:
        fields.append("status = ?")
        vals.append(status)
    if step is not None:
        fields.append("step = ?")
        vals.append(step)
    if error is not None:
        fields.append("error = ?")
        vals.append(error)
    if title is not None:
        fields.append("title = ?")
        vals.append(title)
    if youtube_url is not None:
        fields.append("youtube_url = ?")
        vals.append(youtube_url)
    if local_source_path is not None:
        fields.append("local_source_path = ?")
        vals.append(local_source_path)
    if source_filename is not None:
        fields.append("source_filename = ?")
        vals.append(source_filename)
    if extra is not None:
        fields.append("extra_json = ?")
        vals.append(json.dumps(extra))
    fields.append("updated_at = ?")
    vals.append(_now_iso())
    vals.append(run_id)
    if len(fields) <= 1:
        return
    with connect() as conn:
        conn.execute(
            f"UPDATE pipeline_runs SET {', '.join(fields)} WHERE id = ?",
            vals,
        )
        conn.commit()


def get_run(run_id: str) -> RunRecord:
    init_runs_table()
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM pipeline_runs WHERE id = ?",
            (run_id,),
        ).fetchone()
    if row is None:
        raise KeyError(run_id)
    return _row_to_run(row)


def list_runs(limit: int = 50, status: str | None = None) -> list[RunRecord]:
    init_runs_table()
    with connect() as conn:
        if status:
            rows = conn.execute(
                "SELECT * FROM pipeline_runs WHERE status = ? "
                "ORDER BY created_at DESC LIMIT ?",
                (status, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM pipeline_runs ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
    return [_row_to_run(r) for r in rows]


def delete_run(run_id: str) -> None:
    init_runs_table()
    with connect() as conn:
        conn.execute("DELETE FROM pipeline_runs WHERE id = ?", (run_id,))
        conn.commit()


def get_run_extra_dict(run_id: str) -> dict[str, Any]:
    """Return decoded ``extra_json`` or ``{}``."""
    rec = get_run(run_id)
    if not rec.extra_json:
        return {}
    try:
        out = json.loads(rec.extra_json)
        return out if isinstance(out, dict) else {}
    except json.JSONDecodeError:
        return {}


def merge_run_extra(run_id: str, patch: dict[str, Any]) -> None:
    """Shallow-merge *patch* into the run's ``extra_json``."""
    base = get_run_extra_dict(run_id)
    base.update(patch)
    update_run(run_id, extra=base)
