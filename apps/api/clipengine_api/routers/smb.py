"""SMB/CIFS output configuration (BYOC credentials)."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from clipengine_api.core import db

router = APIRouter(prefix="/api/smb", tags=["smb"])


def _require_setup() -> None:
    complete, _ = db.get_setup_state()
    if not complete:
        raise HTTPException(status_code=403, detail="Complete setup first")


def _load() -> dict[str, Any]:
    raw = db.get_smb_config_json()
    if not raw:
        return {}
    try:
        out = json.loads(raw)
        return out if isinstance(out, dict) else {}
    except json.JSONDecodeError:
        return {}


def _save(data: dict[str, Any]) -> None:
    db.save_smb_config_json(json.dumps(data, ensure_ascii=False))


class SmbConfigBody(BaseModel):
    host: str = Field(..., min_length=1)
    share: str = Field(..., min_length=1)
    port: int = Field(default=445, ge=1, le=65535)
    remote_base_path: str = Field(
        default="",
        description="Path under the share, e.g. clipengine/outputs (use /)",
    )
    username: str = Field(..., min_length=1)
    password: str = Field(default="")


@router.get("/status")
def smb_status() -> dict[str, Any]:
    _require_setup()
    c = _load()
    return {
        "configured": bool(c.get("host") and c.get("share") and c.get("username")),
        "host": c.get("host") or "",
        "share": c.get("share") or "",
        "port": int(c.get("port") or 445),
        "remoteBasePath": c.get("remote_base_path") or "",
        "username": c.get("username") or "",
        "hasPassword": bool(c.get("password")),
    }


@router.put("/config")
def put_smb_config(body: SmbConfigBody) -> dict[str, str]:
    _require_setup()
    c = _load()
    c["host"] = body.host.strip()
    c["share"] = body.share.strip()
    c["port"] = body.port
    c["remote_base_path"] = body.remote_base_path.strip().replace("\\", "/")
    c["username"] = body.username.strip()
    if body.password:
        c["password"] = body.password
    elif not c.get("password"):
        raise HTTPException(
            status_code=400,
            detail="password is required on first save",
        )
    _save(c)
    return {"status": "ok"}


@router.delete("/config")
def delete_smb_config() -> dict[str, str]:
    _require_setup()
    _save({})
    return {"status": "ok"}
