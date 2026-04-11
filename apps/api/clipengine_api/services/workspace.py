"""Workspace paths under CLIPENGINE_WORKSPACE (e.g. /workspace in Docker)."""

from __future__ import annotations

import json
import os
from pathlib import Path

# Video extensions we accept for import listing and pipeline input
VIDEO_EXTENSIONS = {".mp4", ".mkv", ".webm", ".mov", ".avi", ".m4v"}


def workspace_root() -> Path:
    return Path(os.environ.get("CLIPENGINE_WORKSPACE", "/workspace")).resolve()


def runs_dir() -> Path:
    d = workspace_root() / "runs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def run_dir(run_id: str) -> Path:
    return runs_dir() / run_id


def _bind_paths_from_db() -> list[Path]:
    """Directories registered in Settings (bind-mount targets inside the container)."""
    from clipengine_api.core import db as dbmod

    raw = dbmod.get_storage_bind_paths_json()
    if not raw or not str(raw).strip():
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    out: list[Path] = []
    for item in data:
        if not isinstance(item, str) or not item.strip():
            continue
        try:
            out.append(Path(item.strip()).resolve())
        except OSError:
            continue
    return out


def import_roots() -> list[Path]:
    """Allowlisted directories: env CLIPENGINE_IMPORT_ROOTS, workspace, Settings bind paths."""
    seen: set[str] = set()
    roots: list[Path] = []

    def add(p: Path) -> None:
        try:
            r = p.resolve()
        except OSError:
            return
        s = str(r)
        if s not in seen:
            seen.add(s)
            roots.append(r)

    raw = os.environ.get("CLIPENGINE_IMPORT_ROOTS", "")
    for part in raw.split(","):
        p = part.strip()
        if not p:
            continue
        add(Path(p))
    add(workspace_root())
    for bp in _bind_paths_from_db():
        add(bp)
    return roots


def is_under_allowed(path: Path, roots: list[Path] | None = None) -> bool:
    path = path.resolve()
    roots = roots or import_roots()
    for r in roots:
        try:
            path.relative_to(r)
            return True
        except ValueError:
            continue
    return False


def safe_join(root: Path, *parts: str) -> Path:
    """Join path parts under root; reject traversal."""
    root = root.resolve()
    cur = root
    for p in parts:
        if ".." in p or p.startswith("/"):
            raise ValueError("invalid path segment")
        cur = (cur / p).resolve()
        if not str(cur).startswith(str(root)):
            raise ValueError("path escapes root")
    return cur


def list_videos_in_dir(
    directory: Path,
    *,
    recursive: bool = False,
    max_files: int = 500,
    max_depth: int = 6,
) -> list[Path]:
    """List video files. When ``recursive`` is True, walk subdirectories up to ``max_depth``."""
    if not directory.is_dir():
        return []
    out: list[Path] = []
    if not recursive:
        for p in sorted(directory.iterdir()):
            if p.is_file() and p.suffix.lower() in VIDEO_EXTENSIONS:
                out.append(p)
        return out

    def walk(cur: Path, depth: int) -> None:
        if len(out) >= max_files or depth > max_depth:
            return
        try:
            children = sorted(cur.iterdir())
        except OSError:
            return
        for p in children:
            if len(out) >= max_files:
                return
            if p.is_dir():
                walk(p, depth + 1)
            elif p.is_file() and p.suffix.lower() in VIDEO_EXTENSIONS:
                out.append(p)

    walk(directory, 0)
    out.sort(key=lambda x: x.as_posix())
    return out
