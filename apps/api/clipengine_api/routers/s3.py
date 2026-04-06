"""S3-compatible output configuration (BYOC credentials)."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from clipengine_api.core import db

router = APIRouter(prefix="/api/s3", tags=["s3"])


def _require_setup() -> None:
    complete, _ = db.get_setup_state()
    if not complete:
        raise HTTPException(status_code=403, detail="Complete setup first")


def _load() -> dict[str, Any]:
    raw = db.get_s3_config_json()
    if not raw:
        return {}
    try:
        out = json.loads(raw)
        return out if isinstance(out, dict) else {}
    except json.JSONDecodeError:
        return {}


def _save(data: dict[str, Any]) -> None:
    db.save_s3_config_json(json.dumps(data, ensure_ascii=False))


class S3ConfigBody(BaseModel):
    endpoint_url: str = Field(default="", description="Leave empty for AWS; set for MinIO/R2/etc.")
    region: str = Field(default="", min_length=1)
    bucket: str = Field(default="", min_length=1)
    prefix: str = Field(default="", description="Key prefix, e.g. clipengine/")
    access_key_id: str = Field(default="", min_length=1)
    secret_access_key: str = Field(
        default="",
        description="Leave blank to keep the existing secret when updating other fields.",
    )


@router.get("/status")
def s3_status() -> dict[str, Any]:
    _require_setup()
    c = _load()
    return {
        "configured": bool(
            c.get("bucket") and c.get("region") and c.get("access_key_id") and c.get("secret_access_key")
        ),
        "endpointUrl": c.get("endpoint_url") or "",
        "region": c.get("region") or "",
        "bucket": c.get("bucket") or "",
        "prefix": c.get("prefix") or "",
        "hasSecretKey": bool(c.get("secret_access_key")),
    }


@router.put("/config")
def put_s3_config(body: S3ConfigBody) -> dict[str, str]:
    _require_setup()
    c = _load()
    c["endpoint_url"] = body.endpoint_url.strip()
    c["region"] = body.region.strip()
    c["bucket"] = body.bucket.strip()
    c["prefix"] = body.prefix.strip()
    c["access_key_id"] = body.access_key_id.strip()
    if body.secret_access_key.strip():
        c["secret_access_key"] = body.secret_access_key.strip()
    elif not c.get("secret_access_key"):
        raise HTTPException(
            status_code=400,
            detail="secret_access_key is required on first save",
        )
    _save(c)
    return {"status": "ok"}


@router.delete("/config")
def delete_s3_config() -> dict[str, str]:
    _require_setup()
    _save({})
    return {"status": "ok"}
