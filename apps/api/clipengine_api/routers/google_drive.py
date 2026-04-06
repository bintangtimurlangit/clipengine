"""Google Drive connection management endpoints."""

from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from clipengine_api.services import google_drive as gdrive

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/google-drive", tags=["google-drive"])

_CALLBACK_PATH = "/api/google-drive/callback"


def _public_base(request: Request) -> str:
    """Return the public-facing base URL (honours CLIPENGINE_PUBLIC_URL env var)."""
    override = os.environ.get("CLIPENGINE_PUBLIC_URL", "").rstrip("/")
    if override:
        return override
    # Derive from the incoming request (works for direct Docker port mapping)
    return str(request.base_url).rstrip("/")


def _redirect_uri(request: Request) -> str:
    return _public_base(request) + _CALLBACK_PATH


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------


@router.get("/status")
def gdrive_status() -> dict[str, Any]:
    """Return Google Drive connection state."""
    return {
        "hasCredentials": gdrive.has_client_credentials(),
        "connected": gdrive.is_connected(),
    }


# ---------------------------------------------------------------------------
# Credentials (client_id + client_secret)
# ---------------------------------------------------------------------------


class GDriveCredentialsBody(BaseModel):
    clientId: str = Field(..., min_length=1)
    clientSecret: str = Field(..., min_length=1)


@router.post("/credentials")
def save_credentials(body: GDriveCredentialsBody) -> dict[str, Any]:
    """Persist the user's OAuth2 client credentials (clears existing tokens)."""
    gdrive.save_client_credentials(body.clientId, body.clientSecret)
    return {"status": "ok", "connected": gdrive.is_connected()}


# ---------------------------------------------------------------------------
# OAuth2 flow
# ---------------------------------------------------------------------------


@router.get("/auth-url")
def get_auth_url(request: Request) -> dict[str, Any]:
    """Generate the Google OAuth2 authorization URL.

    The frontend should open ``authUrl`` in a new tab. After the user
    authorizes, Google redirects to ``redirectUri`` which our callback
    endpoint handles automatically.
    """
    if not gdrive.has_client_credentials():
        raise HTTPException(
            status_code=400,
            detail="Client credentials not configured. POST /api/google-drive/credentials first.",
        )
    redirect_uri = _redirect_uri(request)
    try:
        auth_url = gdrive.get_auth_url(redirect_uri)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"authUrl": auth_url, "redirectUri": redirect_uri}


@router.get("/callback", response_class=HTMLResponse)
def oauth_callback(code: str, request: Request) -> str:
    """Handle the Google OAuth2 redirect.

    Google sends ``?code=...`` here after the user approves. We exchange the
    code for tokens, persist them, and show a close-this-tab page.

    The user must add *exactly* this URL to their Google Cloud Console:
    ``{CLIPENGINE_PUBLIC_URL}/api/google-drive/callback``
    """
    redirect_uri = _redirect_uri(request)
    try:
        gdrive.exchange_code(code, redirect_uri)
    except Exception as exc:
        log.exception("Google Drive OAuth callback failed")
        return _html_result(
            success=False,
            message=f"OAuth failed: {exc}",
        )
    return _html_result(success=True, message="Google Drive connected successfully!")


@router.delete("/connection")
def disconnect() -> dict[str, Any]:
    """Clear stored OAuth tokens (does not delete client credentials)."""
    gdrive.revoke_connection()
    return {"status": "ok", "connected": False}


# ---------------------------------------------------------------------------
# File browser
# ---------------------------------------------------------------------------


@router.get("/files")
def list_files(folder_id: str = "root") -> dict[str, Any]:
    """List video files and sub-folders in a Google Drive folder.

    Pass ``folder_id=root`` (default) for the top of the user's Drive,
    or any Drive folder ID to browse sub-folders.
    """
    if not gdrive.is_connected():
        raise HTTPException(
            status_code=401,
            detail="Google Drive not connected. Complete the OAuth flow first.",
        )
    try:
        files = gdrive.list_files(folder_id)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Drive API error: {exc}") from exc
    return {"folderId": folder_id, "files": files}


@router.get("/file/{file_id}")
def get_file_info(file_id: str) -> dict[str, Any]:
    """Return metadata for a single Drive file."""
    if not gdrive.is_connected():
        raise HTTPException(status_code=401, detail="Google Drive not connected.")
    try:
        return gdrive.get_file_metadata(file_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Drive API error: {exc}") from exc


# ---------------------------------------------------------------------------
# HTML helpers
# ---------------------------------------------------------------------------


def _html_result(*, success: bool, message: str) -> str:
    icon = "✅" if success else "❌"
    color = "#22c55e" if success else "#ef4444"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ClipEngine – Google Drive</title>
  <style>
    body {{ font-family: system-ui, sans-serif; display: flex; align-items: center;
            justify-content: center; min-height: 100vh; margin: 0;
            background: #0f172a; color: #f1f5f9; }}
    .card {{ background: #1e293b; border-radius: 12px; padding: 2.5rem 3rem;
             text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,.4); }}
    .icon {{ font-size: 3rem; margin-bottom: 1rem; }}
    h2 {{ color: {color}; margin: 0 0 .5rem; }}
    p {{ color: #94a3b8; margin: 0 0 1.5rem; }}
    button {{ background: {color}; color: white; border: none; border-radius: 6px;
              padding: .6rem 1.4rem; font-size: 1rem; cursor: pointer; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">{icon}</div>
    <h2>{"Success" if success else "Error"}</h2>
    <p>{message}</p>
    <button onclick="window.close()">Close Tab</button>
  </div>
</body>
</html>"""
