"""Sync media catalog from local paths, S3 prefixes, or Google Drive folders."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from clipengine_api.services.google_drive import list_files as gdrive_list
from clipengine_api.services.s3_client import get_client_and_bucket, is_configured as s3_configured
from clipengine_api.services.workspace import is_under_allowed, list_videos_in_dir
from clipengine_api.storage import catalog_db

log = logging.getLogger(__name__)


def _iso_from_ts(ts: float | None) -> str | None:
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
    except OSError:
        return None


def sync_local_root(root: Path, *, recursive: bool = True) -> dict[str, Any]:
    """Index videos under *root* (must be under an allowlisted import root)."""
    root = root.resolve()
    if not root.is_dir():
        raise ValueError(f"Not a directory: {root}")
    if not is_under_allowed(root):
        raise PermissionError(f"Path not in allowlisted import roots: {root}")
    prefix = f"local:{root.as_posix()}/"
    n = catalog_db.delete_entries_by_prefix("local", prefix)
    log.debug("Cleared %d prior local catalog rows under %s", n, prefix)
    videos = list_videos_in_dir(root, recursive=recursive, max_files=2000)
    count = 0
    for p in videos:
        try:
            rel = p.relative_to(root)
        except ValueError:
            rel = Path(p.name)
        st = p.stat()
        ref_key = f"local:{p.resolve().as_posix()}"
        catalog_db.upsert_entry(
            source_kind="local",
            ref_key=ref_key,
            display_name=p.name,
            relative_path=str(rel).replace("\\", "/"),
            size_bytes=st.st_size,
            mtime_iso=_iso_from_ts(st.st_mtime),
            extra={"absolutePath": str(p.resolve())},
        )
        count += 1
    return {"kind": "local", "root": str(root), "count": count}


def sync_s3_prefix(prefix: str) -> dict[str, Any]:
    """List video objects under *prefix* in the configured bucket and index them."""
    if not s3_configured():
        raise PermissionError("S3 is not configured in Settings.")
    client, bucket, _ = get_client_and_bucket()
    prefix = prefix.strip().strip("/")
    if prefix:
        prefix = prefix + "/"
    paginator = client.get_paginator("list_objects_v2")
    del_prefix = f"s3:{bucket}:{prefix}" if prefix else f"s3:{bucket}:"
    catalog_db.delete_entries_by_prefix("s3", del_prefix)
    count = 0
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents") or []:
            key = str(obj.get("Key") or "")
            if not key or key.endswith("/"):
                continue
            name = os.path.basename(key)
            if not catalog_db.is_video_filename(name):
                continue
            ref_key = f"s3:{bucket}:{key}"
            catalog_db.upsert_entry(
                source_kind="s3",
                ref_key=ref_key,
                display_name=name,
                relative_path=key,
                size_bytes=int(obj.get("Size") or 0),
                mtime_iso=None,
                extra={"bucket": bucket, "key": key},
            )
            count += 1
    return {"kind": "s3", "bucket": bucket, "prefix": prefix, "count": count}


def _gdrive_walk_folder(folder_id: str, path_parts: list[str]) -> int:
    """Recursively list video files and folders from Drive."""
    count = 0
    try:
        items = gdrive_list(folder_id)
    except Exception:
        log.exception("Drive list failed for folder %s", folder_id)
        return 0
    for item in items:
        kind = item.get("kind")
        iid = str(item.get("id") or "")
        name = str(item.get("name") or "unknown")
        if kind == "folder" and iid:
            count += _gdrive_walk_folder(iid, path_parts + [name])
        elif kind == "file" and iid:
            rel = "/".join(path_parts + [name]) if path_parts else name
            ref_key = f"gdrive:{iid}"
            size = item.get("size")
            try:
                sz = int(size) if size is not None else None
            except (TypeError, ValueError):
                sz = None
            catalog_db.upsert_entry(
                source_kind="google_drive",
                ref_key=ref_key,
                display_name=name,
                relative_path=rel,
                size_bytes=sz,
                mtime_iso=str(item.get("modifiedTime") or "") or None,
                extra={"fileId": iid},
            )
            count += 1
    return count


def sync_google_drive_folder(folder_id: str) -> dict[str, Any]:
    """Index videos under a Drive folder (recursive)."""
    catalog_db.delete_entries_by_prefix("google_drive", "gdrive:")
    n = _gdrive_walk_folder(folder_id, [])
    return {"kind": "google_drive", "folderId": folder_id, "count": n}
