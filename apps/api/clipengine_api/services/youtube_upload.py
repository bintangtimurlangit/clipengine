"""YouTube Data API v3 upload — user-supplied OAuth client (BYOC).

Users bring their own Google Cloud project:
  1. Enable **YouTube Data API v3** for the project.
  2. Create OAuth 2.0 credentials (type: *Web application*).
  3. Add ``{CLIPENGINE_PUBLIC_URL}/api/youtube/callback`` as an Authorized Redirect URI.
  4. Copy Client ID and Client Secret into ClipEngine Settings → YouTube.
  5. Click "Connect" — authorize in the browser — done.

Default API quota is limited (~6 uploads/day at default 10,000 units; each upload ~1,600 units).
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from clipengine_api.core import db

log = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]


def _load_config() -> dict[str, Any]:
    raw = db.get_youtube_config_json()
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def _save_config(cfg: dict[str, Any]) -> None:
    db.save_youtube_config_json(json.dumps(cfg))


def has_client_credentials() -> bool:
    cfg = _load_config()
    return bool(cfg.get("client_id") and cfg.get("client_secret"))


def is_connected() -> bool:
    cfg = _load_config()
    return bool(cfg.get("refresh_token"))


def save_client_credentials(client_id: str, client_secret: str) -> None:
    cfg = _load_config()
    cfg["client_id"] = client_id.strip()
    cfg["client_secret"] = client_secret.strip()
    cfg.pop("token", None)
    cfg.pop("refresh_token", None)
    _save_config(cfg)


def revoke_connection() -> None:
    cfg = _load_config()
    cfg.pop("token", None)
    cfg.pop("refresh_token", None)
    _save_config(cfg)


def _client_config(cfg: dict[str, Any], redirect_uri: str) -> dict[str, Any]:
    return {
        "web": {
            "client_id": cfg["client_id"],
            "client_secret": cfg["client_secret"],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
        }
    }


def get_auth_url(redirect_uri: str) -> str:
    from google_auth_oauthlib.flow import Flow  # type: ignore[import-untyped]

    cfg = _load_config()
    if not cfg.get("client_id") or not cfg.get("client_secret"):
        raise ValueError(
            "YouTube OAuth client credentials not configured. "
            "Set client_id and client_secret first."
        )

    flow = Flow.from_client_config(
        _client_config(cfg, redirect_uri),
        scopes=SCOPES,
        redirect_uri=redirect_uri,
    )
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    return auth_url


def exchange_code(code: str, redirect_uri: str) -> None:
    from google_auth_oauthlib.flow import Flow  # type: ignore[import-untyped]

    cfg = _load_config()
    flow = Flow.from_client_config(
        _client_config(cfg, redirect_uri),
        scopes=SCOPES,
        redirect_uri=redirect_uri,
    )
    flow.fetch_token(code=code)
    creds = flow.credentials
    cfg["token"] = creds.token
    cfg["refresh_token"] = creds.refresh_token
    cfg["token_uri"] = "https://oauth2.googleapis.com/token"
    cfg["scopes"] = list(SCOPES)
    _save_config(cfg)
    log.info("YouTube upload OAuth connected — refresh_token stored.")


def _get_credentials():
    from google.auth.transport.requests import Request  # type: ignore[import-untyped]
    from google.oauth2.credentials import Credentials  # type: ignore[import-untyped]

    cfg = _load_config()
    if not cfg.get("refresh_token"):
        raise PermissionError(
            "YouTube is not connected — complete the OAuth flow in Settings first."
        )

    creds = Credentials(
        token=cfg.get("token"),
        refresh_token=cfg["refresh_token"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=cfg["client_id"],
        client_secret=cfg["client_secret"],
        scopes=cfg.get("scopes", SCOPES),
    )
    if not creds.valid:
        creds.refresh(Request())
        cfg["token"] = creds.token
        _save_config(cfg)
    return creds


def _sanitize_title(s: str, max_len: int = 95) -> str:
    s = re.sub(r'[<>"]', "", s)
    s = s.strip() or "Clip"
    return s[:max_len]


def _normalize_privacy(privacy_status: str) -> str:
    p = privacy_status.lower().strip()
    if p in ("private", "unlisted", "public"):
        return p
    return "private"


def upload_rendered_mp4s(
    local_run_dir: Path,
    *,
    run_title: str | None,
    privacy_status: str = "private",
) -> list[dict[str, str]]:
    """Upload every ``*.mp4`` under ``local_run_dir/rendered`` to the authorized channel.

    Returns a list of dicts with ``path``, ``videoId``, ``watchUrl``.
    """
    from googleapiclient.discovery import build  # type: ignore[import-untyped]
    from googleapiclient.http import MediaFileUpload  # type: ignore[import-untyped]

    rendered = local_run_dir / "rendered"
    if not rendered.is_dir():
        return []

    base = (run_title or "").strip() or "Clip Engine"
    priv = _normalize_privacy(privacy_status)
    creds = _get_credentials()
    youtube = build("youtube", "v3", credentials=creds, cache_discovery=False)

    out: list[dict[str, str]] = []
    mp4_paths = sorted(rendered.rglob("*.mp4"), key=lambda p: p.as_posix())

    for path in mp4_paths:
        rel = path.relative_to(rendered)
        clip_label = str(rel).replace("\\", " / ").replace("/", " / ")
        title = _sanitize_title(f"{base} — {clip_label.replace('.mp4', '')}")

        body = {
            "snippet": {
                "title": title,
                "description": f"Exported from Clip Engine.\n{clip_label}",
                "categoryId": "22",
            },
            "status": {"privacyStatus": priv, "selfDeclaredMadeForKids": False},
        }
        media = MediaFileUpload(str(path), mimetype="video/mp4", resumable=True)
        request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)
        response = None
        while response is None:
            status, response = request.next_chunk()
            if status and log.isEnabledFor(logging.DEBUG):
                log.debug("YouTube upload chunk %s%%", int(status.progress() * 100))

        vid = str(response.get("id", ""))
        if not vid:
            log.warning("YouTube insert returned no id for %s", path)
            continue
        watch = f"https://www.youtube.com/watch?v={vid}"
        out.append(
            {
                "path": f"rendered/{rel.as_posix()}",
                "videoId": vid,
                "watchUrl": watch,
            }
        )
        log.info("Uploaded to YouTube: %s → %s", path.name, watch)

    return out
