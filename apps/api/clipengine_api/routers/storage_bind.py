"""Register Docker bind-mount paths (directories visible inside the API container)."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from clipengine_api.core import db

router = APIRouter(prefix="/api/storage", tags=["storage"])


def _require_setup() -> None:
    complete, _ = db.get_setup_state()
    if not complete:
        raise HTTPException(status_code=403, detail="Complete setup first")


def _normalize_paths(paths: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in paths:
        if not isinstance(raw, str):
            continue
        s = raw.strip()
        if not s:
            continue
        p = Path(s)
        if not p.is_absolute():
            raise HTTPException(
                status_code=400,
                detail=f"Path must be absolute: {s!r}",
            )
        try:
            r = p.resolve()
        except OSError as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid path {s!r}: {e}",
            ) from e
        if not r.is_dir():
            raise HTTPException(
                status_code=400,
                detail=f"Path must be an existing directory: {r}",
            )
        key = str(r)
        if key not in seen:
            seen.add(key)
            out.append(key)
    return out


class BindPathsBody(BaseModel):
    paths: list[str] = Field(default_factory=list)


@router.get("/bind-paths")
def get_bind_paths() -> dict[str, object]:
    """Paths registered for local output / import allowlist."""
    _require_setup()
    raw = db.get_storage_bind_paths_json()
    if not raw or not str(raw).strip():
        return {"paths": []}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {"paths": []}
    if not isinstance(data, list):
        return {"paths": []}
    paths: list[dict[str, object]] = []
    for item in data:
        if not isinstance(item, str) or not item.strip():
            continue
        p = Path(item.strip())
        try:
            r = p.resolve()
        except OSError:
            paths.append({"path": item.strip(), "exists": False})
            continue
        paths.append({"path": str(r), "exists": r.is_dir()})
    return {"paths": paths}


@router.put("/bind-paths")
def put_bind_paths(body: BindPathsBody) -> dict[str, str]:
    """Replace the list of allowlisted bind-mount directories (container paths)."""
    _require_setup()
    normalized = _normalize_paths(body.paths)
    db.save_storage_bind_paths_json(json.dumps(normalized, ensure_ascii=False))
    return {"status": "ok"}
