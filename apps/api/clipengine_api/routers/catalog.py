"""Media catalog index (browse, sync)."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from clipengine_api.services import catalog_sync
from clipengine_api.services.google_drive import is_connected as gdrive_connected
from clipengine_api.services.s3_client import is_configured as s3_configured
from clipengine_api.storage import catalog_db

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


class CatalogSyncBody(BaseModel):
    kind: Literal["local", "s3", "google_drive"]
    root_path: str | None = Field(
        default=None,
        description="Absolute directory under an allowlisted root (local sync only)",
    )
    recursive: bool = True
    s3_prefix: str = Field(default="", description="Key prefix, e.g. shows/StarWars/")
    folder_id: str | None = Field(
        default=None,
        description="Google Drive folder id (default: root)",
    )


@router.get("/entries")
def list_catalog_entries(
    source_kind: str | None = Query(None, description="Filter: local, s3, google_drive"),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    entries = catalog_db.list_entries(source_kind=source_kind, limit=limit, offset=offset)
    return {
        "entries": [e.to_dict() for e in entries],
        "count": len(entries),
    }


@router.get("/entries/{entry_id}")
def get_catalog_entry(entry_id: str) -> dict[str, Any]:
    try:
        e = catalog_db.get_entry(entry_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Catalog entry not found") from None
    return {"entry": e.to_dict()}


@router.post("/sync")
def sync_catalog(body: CatalogSyncBody) -> dict[str, Any]:
    try:
        if body.kind == "local":
            if not body.root_path or not str(body.root_path).strip():
                raise HTTPException(status_code=400, detail="root_path required for local sync")
            return catalog_sync.sync_local_root(
                Path(body.root_path.strip()),
                recursive=body.recursive,
            )
        if body.kind == "s3":
            if not s3_configured():
                raise HTTPException(
                    status_code=401,
                    detail="S3 is not configured — add credentials in Settings.",
                )
            return catalog_sync.sync_s3_prefix(body.s3_prefix)
        if body.kind == "google_drive":
            if not gdrive_connected():
                raise HTTPException(
                    status_code=401,
                    detail="Google Drive not connected — complete OAuth in Settings.",
                )
            fid = (body.folder_id or "root").strip() or "root"
            return catalog_sync.sync_google_drive_folder(fid)
    except HTTPException:
        raise
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
