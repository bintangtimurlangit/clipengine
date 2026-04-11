"""Media catalog index (SQLite) — discovered sources for browsing and autopilot."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from clipengine_api.core.db import connect, init_db as init_app_settings

_VIDEO_EXT = {".mp4", ".mkv", ".webm", ".mov", ".avi", ".m4v"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_catalog_table() -> None:
    init_app_settings()
    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS media_catalog (
                id TEXT PRIMARY KEY,
                source_kind TEXT NOT NULL,
                ref_key TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                relative_path TEXT,
                size_bytes INTEGER,
                mtime_iso TEXT,
                duration_s REAL,
                state TEXT NOT NULL DEFAULT 'discovered',
                extra_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_media_catalog_kind ON media_catalog(source_kind)"
        )
        conn.commit()


@dataclass
class CatalogEntry:
    id: str
    source_kind: str
    ref_key: str
    display_name: str
    relative_path: str | None
    size_bytes: int | None
    mtime_iso: str | None
    duration_s: float | None
    state: str
    extra: dict[str, Any] | None
    created_at: str
    updated_at: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "sourceKind": self.source_kind,
            "refKey": self.ref_key,
            "displayName": self.display_name,
            "relativePath": self.relative_path,
            "sizeBytes": self.size_bytes,
            "mtimeIso": self.mtime_iso,
            "durationS": self.duration_s,
            "state": self.state,
            "extra": self.extra,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }


def _row_to_entry(row: Any) -> CatalogEntry:
    extra_raw = row["extra_json"]
    ex: dict[str, Any] | None = None
    if extra_raw:
        try:
            j = json.loads(str(extra_raw))
            ex = j if isinstance(j, dict) else None
        except json.JSONDecodeError:
            ex = None
    return CatalogEntry(
        id=str(row["id"]),
        source_kind=str(row["source_kind"]),
        ref_key=str(row["ref_key"]),
        display_name=str(row["display_name"]),
        relative_path=str(row["relative_path"]) if row["relative_path"] else None,
        size_bytes=int(row["size_bytes"]) if row["size_bytes"] is not None else None,
        mtime_iso=str(row["mtime_iso"]) if row["mtime_iso"] else None,
        duration_s=float(row["duration_s"]) if row["duration_s"] is not None else None,
        state=str(row["state"]),
        extra=ex,
        created_at=str(row["created_at"]),
        updated_at=str(row["updated_at"]),
    )


def upsert_entry(
    *,
    source_kind: str,
    ref_key: str,
    display_name: str,
    relative_path: str | None = None,
    size_bytes: int | None = None,
    mtime_iso: str | None = None,
    duration_s: float | None = None,
    state: str = "discovered",
    extra: dict[str, Any] | None = None,
    entry_id: str | None = None,
) -> CatalogEntry:
    init_catalog_table()
    ts = _now_iso()
    extra_json = json.dumps(extra, ensure_ascii=False) if extra else None
    with connect() as conn:
        row = conn.execute(
            "SELECT id FROM media_catalog WHERE ref_key = ?",
            (ref_key,),
        ).fetchone()
        eid = str(row["id"]) if row else (entry_id or str(uuid.uuid4()))
        if row:
            conn.execute(
                """
                UPDATE media_catalog SET
                    source_kind = ?, display_name = ?, relative_path = ?,
                    size_bytes = ?, mtime_iso = ?, duration_s = ?, state = ?,
                    extra_json = ?, updated_at = ?
                WHERE ref_key = ?
                """,
                (
                    source_kind,
                    display_name,
                    relative_path,
                    size_bytes,
                    mtime_iso,
                    duration_s,
                    state,
                    extra_json,
                    ts,
                    ref_key,
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO media_catalog (
                    id, source_kind, ref_key, display_name, relative_path,
                    size_bytes, mtime_iso, duration_s, state, extra_json,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    eid,
                    source_kind,
                    ref_key,
                    display_name,
                    relative_path,
                    size_bytes,
                    mtime_iso,
                    duration_s,
                    state,
                    extra_json,
                    ts,
                    ts,
                ),
            )
        conn.commit()
    return get_entry_by_ref(ref_key)


def get_entry_by_ref(ref_key: str) -> CatalogEntry:
    init_catalog_table()
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM media_catalog WHERE ref_key = ?",
            (ref_key,),
        ).fetchone()
    if row is None:
        raise KeyError(ref_key)
    return _row_to_entry(row)


def get_entry(entry_id: str) -> CatalogEntry:
    init_catalog_table()
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM media_catalog WHERE id = ?",
            (entry_id,),
        ).fetchone()
    if row is None:
        raise KeyError(entry_id)
    return _row_to_entry(row)


def list_entries(
    *,
    source_kind: str | None = None,
    limit: int = 500,
    offset: int = 0,
) -> list[CatalogEntry]:
    init_catalog_table()
    limit = max(1, min(limit, 2000))
    offset = max(0, offset)
    with connect() as conn:
        if source_kind:
            rows = conn.execute(
                """
                SELECT * FROM media_catalog WHERE source_kind = ?
                ORDER BY relative_path, display_name
                LIMIT ? OFFSET ?
                """,
                (source_kind, limit, offset),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT * FROM media_catalog
                ORDER BY updated_at DESC
                LIMIT ? OFFSET ?
                """,
                (limit, offset),
            ).fetchall()
    return [_row_to_entry(r) for r in rows]


def delete_entries_by_prefix(source_kind: str, ref_prefix: str) -> int:
    """Remove rows where ref_key starts with *ref_prefix* (for resync)."""
    init_catalog_table()
    with connect() as conn:
        cur = conn.execute(
            "DELETE FROM media_catalog WHERE source_kind = ? AND ref_key LIKE ?",
            (source_kind, ref_prefix + "%"),
        )
        conn.commit()
        return cur.rowcount


def is_video_filename(name: str) -> bool:
    return Path(name).suffix.lower() in _VIDEO_EXT
