"""YouTube upload connection (OAuth2) endpoints."""

from __future__ import annotations

import logging
import os
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query, Request
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
        "accounts": yt.list_accounts(),
    }


class YouTubeCredentialsBody(BaseModel):
    clientId: str = Field(..., min_length=1)
    clientSecret: str = Field(..., min_length=1)


@router.post("/credentials")
def save_credentials(body: YouTubeCredentialsBody) -> dict[str, Any]:
    yt.save_client_credentials(body.clientId, body.clientSecret)
    return {"status": "ok", "connected": yt.is_connected()}


class AuthUrlBody(BaseModel):
    intent: Literal["add", "replace"] = "add"
    accountId: str | None = None


@router.post("/auth-url")
def post_auth_url(request: Request, body: AuthUrlBody | None = None) -> dict[str, Any]:
    if not yt.has_client_credentials():
        raise HTTPException(
            status_code=400,
            detail="Client credentials not configured. POST /api/youtube/credentials first.",
        )
    redirect_uri = _redirect_uri(request)
    try:
        b = body or AuthUrlBody()
        intent = b.intent
        account_id = b.accountId
        if intent == "replace" and not account_id:
            raise HTTPException(
                status_code=400,
                detail="accountId is required when intent is replace",
            )
        oauth_state = yt.create_oauth_state(intent=intent, account_id=account_id)
        auth_url = yt.get_auth_url(redirect_uri, oauth_state=oauth_state)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"authUrl": auth_url, "redirectUri": redirect_uri, "state": oauth_state}


@router.get("/callback", response_class=HTMLResponse)
def oauth_callback(
    code: str,
    request: Request,
    state: str | None = Query(None),
) -> str:
    """OAuth redirect: add ``{CLIPENGINE_PUBLIC_URL}/api/youtube/callback`` in Google Cloud."""
    redirect_uri = _redirect_uri(request)
    meta = yt.consume_oauth_state(state)
    if meta is None:
        meta = {"intent": "add", "account_id": None}
    try:
        yt.exchange_code(code, redirect_uri, oauth_meta=meta)
    except Exception as exc:
        log.exception("YouTube OAuth callback failed")
        return _html_result(success=False, message=f"OAuth failed: {exc}")
    return _html_result(success=True, message="YouTube upload connected successfully!")


@router.delete("/connection")
def disconnect_all() -> dict[str, Any]:
    yt.revoke_connection()
    return {"status": "ok", "connected": False}


@router.delete("/connection/{account_id}")
def disconnect_account(account_id: str) -> dict[str, Any]:
    yt.revoke_account(account_id)
    return {"status": "ok", "connected": yt.is_connected()}
