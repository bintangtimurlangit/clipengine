"""YouTube upload connection (OAuth2) endpoints."""

from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from clipengine_api.services import youtube_upload as yt

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/youtube", tags=["youtube"])

_CALLBACK_PATH = "/api/youtube/callback"


def _public_base(request: Request) -> str:
    override = os.environ.get("CLIPENGINE_PUBLIC_URL", "").rstrip("/")
    if override:
        return override
    return str(request.base_url).rstrip("/")


def _redirect_uri(request: Request) -> str:
    return _public_base(request) + _CALLBACK_PATH


@router.get("/status")
def youtube_status() -> dict[str, Any]:
    return {
        "hasCredentials": yt.has_client_credentials(),
        "connected": yt.is_connected(),
    }


class YouTubeCredentialsBody(BaseModel):
    clientId: str = Field(..., min_length=1)
    clientSecret: str = Field(..., min_length=1)


@router.post("/credentials")
def save_credentials(body: YouTubeCredentialsBody) -> dict[str, Any]:
    yt.save_client_credentials(body.clientId, body.clientSecret)
    return {"status": "ok", "connected": yt.is_connected()}


@router.get("/auth-url")
def get_auth_url(request: Request) -> dict[str, Any]:
    if not yt.has_client_credentials():
        raise HTTPException(
            status_code=400,
            detail="Client credentials not configured. POST /api/youtube/credentials first.",
        )
    redirect_uri = _redirect_uri(request)
    try:
        auth_url = yt.get_auth_url(redirect_uri)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"authUrl": auth_url, "redirectUri": redirect_uri}


@router.get("/callback", response_class=HTMLResponse)
def oauth_callback(code: str, request: Request) -> str:
    """OAuth redirect: add ``{CLIPENGINE_PUBLIC_URL}/api/youtube/callback`` in Google Cloud."""
    redirect_uri = _redirect_uri(request)
    try:
        yt.exchange_code(code, redirect_uri)
    except Exception as exc:
        log.exception("YouTube OAuth callback failed")
        return _html_result(success=False, message=f"OAuth failed: {exc}")
    return _html_result(success=True, message="YouTube upload connected successfully!")


@router.delete("/connection")
def disconnect() -> dict[str, Any]:
    yt.revoke_connection()
    return {"status": "ok", "connected": False}


def _html_result(*, success: bool, message: str) -> str:
    icon = "✅" if success else "❌"
    color = "#22c55e" if success else "#ef4444"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ClipEngine – YouTube</title>
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
