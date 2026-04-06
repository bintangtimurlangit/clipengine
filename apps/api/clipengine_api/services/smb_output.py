"""Copy rendered MP4s to an SMB/CIFS share (user credentials in SQLite).

Intended for LAN or VPN-only reachability—do not expose SMB (port 445) to the public internet.
For remote NAS from a VPS, prefer S3/Drive/workspace or VPN + host mount."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from clipengine_api.core import db

log = logging.getLogger(__name__)


def _load_config() -> dict[str, Any]:
    raw = db.get_smb_config_json()
    if not raw:
        return {}
    try:
        out = json.loads(raw)
        return out if isinstance(out, dict) else {}
    except json.JSONDecodeError:
        return {}


def is_configured() -> bool:
    c = _load_config()
    return bool(c.get("host") and c.get("share") and c.get("username"))


def _ensure_remote_dirs(conn: Any, share: str, dir_path: str) -> None:
    """Create *dir_path* (posix, no leading slash) one segment at a time."""
    parts = [p for p in dir_path.replace("\\", "/").split("/") if p]
    acc = ""
    for p in parts:
        acc = f"{acc}/{p}" if acc else p
        try:
            conn.createDirectory(share, acc)
        except Exception:
            pass


def upload_rendered_mp4s(
    local_run_dir: Path,
    run_id: str,
    *,
    subpath_extra: str | None = None,
) -> list[str]:
    """Upload ``rendered/**/*.mp4`` under the configured share path (pysmb)."""
    from smb.SMBConnection import SMBConnection  # type: ignore[import-untyped]

    cfg = _load_config()
    host = str(cfg.get("host") or "").strip()
    share = str(cfg.get("share") or "").strip()
    user = str(cfg.get("username") or "").strip()
    password = str(cfg.get("password") or "")
    port = int(cfg.get("port") or 445)
    base = str(cfg.get("remote_base_path") or "").strip().strip("/")

    if not host or not share or not user:
        raise PermissionError("SMB is not configured in Settings.")

    conn = SMBConnection(
        user,
        password,
        "clipengine",
        host,
        domain="",
        use_ntlm_v2=True,
        is_direct_tcp=True,
    )
    ok = conn.connect(host, port)
    if not ok:
        raise ConnectionError(f"Could not connect to SMB host {host}:{port}")

    try:
        remote_root_parts: list[str] = []
        if base:
            remote_root_parts.extend(base.split("/"))
        if subpath_extra:
            remote_root_parts.extend(
                [p for p in subpath_extra.strip("/").split("/") if p]
            )
        remote_root_parts.append(run_id)
        remote_root_parts.append("rendered")

        rendered = local_run_dir / "rendered"
        if not rendered.is_dir():
            return []

        uploaded: list[str] = []
        for path in sorted(rendered.rglob("*.mp4")):
            rel = path.relative_to(rendered)
            rel_parts = [p for p in rel.parts]
            remote_dir = "/".join([*remote_root_parts, *rel_parts[:-1]])
            remote_file = "/".join([*remote_root_parts, *rel_parts])
            if remote_dir:
                _ensure_remote_dirs(conn, share, remote_dir)
            with open(path, "rb") as src:
                conn.storeFile(share, remote_file, src)
            uploaded.append(f"//{host}/{share}/{remote_file}")
            log.info("Uploaded to SMB %s", remote_file)
        return uploaded
    finally:
        conn.close()
