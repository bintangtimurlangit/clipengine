"""YouTube Data API v3 upload — user-supplied OAuth client (BYOC).

Users bring their own Google Cloud project:
  1. Enable **YouTube Data API v3** for the project.
  2. Create OAuth 2.0 credentials (type: *Web application*).
  3. Add ``{CLIPENGINE_PUBLIC_URL}/api/youtube/callback`` as an Authorized Redirect URI.
  4. Copy Client ID and Client Secret into ClipEngine Settings → YouTube.
  5. Click "Connect" — authorize in the browser — done.

Multiple Google accounts can be connected; each completes OAuth and gets its own refresh token.
Default API quota is limited (~6 uploads/day at default 10,000 units; each upload ~1,600 units)
**per Google Cloud project** — multiple channels do not multiply quota.
"""

from __future__ import annotations

import json
import logging
import random
import secrets
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Literal

from clipengine_api.core import db
from clipengine_api.services.publish_metadata import build_youtube_snippets_for_run

log = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
]

# ---------------------------------------------------------------------------
# Config shape: { client_id, client_secret, accounts: [ { id, refresh_token, ... } ] }
# Legacy: top-level refresh_token only — migrated on load/save.
# ---------------------------------------------------------------------------


def _load_raw_config() -> dict[str, Any]:
    raw = db.get_youtube_config_json()
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def _migrate_config(cfg: dict[str, Any]) -> dict[str, Any]:
    if cfg.get("accounts") and isinstance(cfg["accounts"], list):
        return cfg
    if cfg.get("refresh_token"):
        acc = {
            "id": str(cfg.get("default_account_id") or "default"),
            "refresh_token": cfg["refresh_token"],
            "token": cfg.get("token"),
            "token_uri": cfg.get("token_uri") or "https://oauth2.googleapis.com/token",
            "scopes": cfg.get("scopes", SCOPES),
        }
        if cfg.get("channel_id"):
            acc["channel_id"] = cfg["channel_id"]
        if cfg.get("channel_title"):
            acc["channel_title"] = cfg["channel_title"]
        out = {k: v for k, v in cfg.items() if k not in ("refresh_token", "token", "scopes")}
        out["accounts"] = [acc]
        return out
    cfg.setdefault("accounts", [])
    return cfg


def _save_config(cfg: dict[str, Any]) -> None:
    cfg = _migrate_config(cfg)
    db.save_youtube_config_json(json.dumps(cfg))


_oauth_lock = threading.Lock()
# state_token -> { "exp": unix, "intent": "add"|"replace", "account_id": str|None }
_oauth_pending: dict[str, dict[str, Any]] = {}
_OAUTH_TTL_SEC = 900


def _purge_oauth_expired() -> None:
    now = time.time()
    dead = [k for k, v in _oauth_pending.items() if v.get("exp", 0) < now]
    for k in dead:
        _oauth_pending.pop(k, None)


def create_oauth_state(*, intent: Literal["add", "replace"], account_id: str | None) -> str:
    """Return opaque state for OAuth; must be passed to get_auth_url and verified in callback."""
    token = secrets.token_urlsafe(32)
    with _oauth_lock:
        _purge_oauth_expired()
        _oauth_pending[token] = {
            "exp": time.time() + _OAUTH_TTL_SEC,
            "intent": intent,
            "account_id": account_id,
        }
    return token


def consume_oauth_state(state: str | None) -> dict[str, Any] | None:
    """Return pending OAuth metadata once, or None if invalid/expired."""
    if not state:
        return None
    with _oauth_lock:
        _purge_oauth_expired()
        meta = _oauth_pending.pop(state, None)
    return meta


def _load_config() -> dict[str, Any]:
    cfg = _load_raw_config()
    return _migrate_config(cfg)


def has_client_credentials() -> bool:
    cfg = _load_config()
    return bool(cfg.get("client_id") and cfg.get("client_secret"))


def list_accounts() -> list[dict[str, Any]]:
    """Account dicts safe for API (no refresh_token)."""
    cfg = _load_config()
    out: list[dict[str, Any]] = []
    for a in cfg.get("accounts") or []:
        if not isinstance(a, dict):
            continue
        aid = a.get("id")
        if not aid:
            continue
        out.append(
            {
                "id": str(aid),
                "connected": bool(a.get("refresh_token")),
                "channelId": a.get("channel_id"),
                "channelTitle": a.get("channel_title"),
            }
        )
    return out


def is_connected() -> bool:
    """True if at least one account has a refresh token."""
    cfg = _load_config()
    for a in cfg.get("accounts") or []:
        if isinstance(a, dict) and a.get("refresh_token"):
            return True
    return False


def account_ids_with_tokens() -> list[str]:
    cfg = _load_config()
    ids: list[str] = []
    for a in cfg.get("accounts") or []:
        if isinstance(a, dict) and a.get("refresh_token") and a.get("id"):
            ids.append(str(a["id"]))
    return ids


def save_client_credentials(client_id: str, client_secret: str) -> None:
    cfg = _load_config()
    cfg["client_id"] = client_id.strip()
    cfg["client_secret"] = client_secret.strip()
    for a in cfg.get("accounts") or []:
        if isinstance(a, dict):
            a.pop("token", None)
            a.pop("refresh_token", None)
    _save_config(cfg)


def revoke_connection() -> None:
    """Disconnect all accounts (keeps OAuth client id/secret)."""
    cfg = _load_config()
    for a in cfg.get("accounts") or []:
        if isinstance(a, dict):
            a.pop("token", None)
            a.pop("refresh_token", None)
    _save_config(cfg)


def revoke_account(account_id: str) -> None:
    cfg = _load_config()
    accounts = cfg.get("accounts") or []
    new_accounts: list[dict[str, Any]] = []
    for a in accounts:
        if not isinstance(a, dict):
            continue
        if str(a.get("id")) == account_id:
            a = {**a, "token": None, "refresh_token": None}
        new_accounts.append(a)
    cfg["accounts"] = new_accounts
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


def get_auth_url(redirect_uri: str, *, oauth_state: str) -> str:
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
        state=oauth_state,
    )
    return auth_url


def _fetch_channel_meta(creds: Any) -> tuple[str | None, str | None]:
    try:
        from googleapiclient.discovery import build  # type: ignore[import-untyped]

        yt = build("youtube", "v3", credentials=creds, cache_discovery=False)
        resp = yt.channels().list(part="snippet", mine=True).execute()
        items = resp.get("items") or []
        if not items:
            return None, None
        ch = items[0]
        cid = str(ch.get("id") or "")
        title = None
        sn = ch.get("snippet") or {}
        if isinstance(sn, dict):
            title = sn.get("title")
        return (cid or None, str(title) if title else None)
    except Exception:
        log.exception("Could not fetch YouTube channel metadata after OAuth")
        return None, None


def exchange_code(
    code: str,
    redirect_uri: str,
    *,
    oauth_meta: dict[str, Any] | None,
) -> None:
    from google_auth_oauthlib.flow import Flow  # type: ignore[import-untyped]

    cfg = _load_config()
    flow = Flow.from_client_config(
        _client_config(cfg, redirect_uri),
        scopes=SCOPES,
        redirect_uri=redirect_uri,
    )
    flow.fetch_token(code=code)
    creds = flow.credentials
    token = creds.token
    refresh = creds.refresh_token

    accounts: list[dict[str, Any]] = list(cfg.get("accounts") or [])
    intent = (oauth_meta or {}).get("intent") if oauth_meta else None
    target_id = (oauth_meta or {}).get("account_id") if oauth_meta else None

    if intent == "replace" and target_id:
        found = False
        for a in accounts:
            if isinstance(a, dict) and str(a.get("id")) == str(target_id):
                a["token"] = token
                a["refresh_token"] = refresh
                a["token_uri"] = "https://oauth2.googleapis.com/token"
                a["scopes"] = list(SCOPES)
                ch_id, ch_title = _fetch_channel_meta(creds)
                if ch_id:
                    a["channel_id"] = ch_id
                if ch_title:
                    a["channel_title"] = ch_title
                found = True
                break
        if not found:
            raise ValueError(f"Account {target_id} not found")
    else:
        # add (default)
        new_id = str(uuid.uuid4())
        acc: dict[str, Any] = {
            "id": new_id,
            "token": token,
            "refresh_token": refresh,
            "token_uri": "https://oauth2.googleapis.com/token",
            "scopes": list(SCOPES),
        }
        ch_id, ch_title = _fetch_channel_meta(creds)
        if ch_id:
            acc["channel_id"] = ch_id
        if ch_title:
            acc["channel_title"] = ch_title
        accounts.append(acc)

    cfg["accounts"] = accounts
    _save_config(cfg)
    log.info("YouTube OAuth stored for account intent=%s", intent)


def _account_by_id(cfg: dict[str, Any], account_id: str) -> dict[str, Any] | None:
    for a in cfg.get("accounts") or []:
        if isinstance(a, dict) and str(a.get("id")) == account_id:
            return a
    return None


def _get_credentials_for_account(account_id: str):
    from google.auth.transport.requests import Request  # type: ignore[import-untyped]
    from google.oauth2.credentials import Credentials  # type: ignore[import-untyped]

    cfg = _load_config()
    a = _account_by_id(cfg, account_id)
    if not a or not a.get("refresh_token"):
        raise PermissionError(f"YouTube account {account_id} is not connected.")

    creds = Credentials(
        token=a.get("token"),
        refresh_token=a["refresh_token"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=cfg["client_id"],
        client_secret=cfg["client_secret"],
        scopes=a.get("scopes", SCOPES),
    )
    if not creds.valid:
        creds.refresh(Request())
        a["token"] = creds.token
        _save_config(cfg)
    return creds


def _normalize_privacy(privacy_status: str) -> str:
    p = privacy_status.lower().strip()
    if p in ("private", "unlisted", "public"):
        return p
    return "private"


YouTubeDistribution = Literal[
    "single",
    "random",
    "round_robin",
    "random_run",
    "broadcast",
]


def _normalize_distribution(raw: str | None) -> YouTubeDistribution:
    s = (raw or "single").lower().strip()
    if s in ("single", "random", "round_robin", "random_run", "broadcast"):
        return s  # type: ignore[return-value]
    return "single"


def pick_accounts_for_clip(
    distribution: YouTubeDistribution,
    selected_ids: list[str],
    *,
    clip_index: int,
    run_id: str,
) -> list[str]:
    """Return which account id(s) should receive this clip upload."""
    ids = [x for x in selected_ids if x.strip()]
    if not ids:
        all_ids = account_ids_with_tokens()
        if not all_ids:
            raise PermissionError("No YouTube accounts connected.")
        ids = all_ids

    if distribution == "broadcast":
        return list(ids)

    if distribution == "single":
        return [ids[0]]

    if distribution == "round_robin":
        return [ids[clip_index % len(ids)]]

    if distribution == "random_run":
        rng = random.Random(run_id)
        return [rng.choice(ids)]

    if distribution == "random":
        return [secrets.choice(ids)]

    return [ids[0]]


def upload_rendered_mp4s(
    local_run_dir: Path,
    *,
    run_id: str,
    run_title: str | None,
    privacy_status: str = "private",
    youtube_distribution: str | None = None,
    youtube_account_ids: list[str] | None = None,
) -> list[dict[str, str]]:
    """Upload ``*.mp4`` under ``local_run_dir/rendered`` per distribution settings.

    Returns a list of dicts with ``path``, ``videoId``, ``watchUrl``, ``accountId``, ``channelTitle``.
    """
    from googleapiclient.discovery import build  # type: ignore[import-untyped]
    from googleapiclient.http import MediaFileUpload  # type: ignore[import-untyped]

    rendered = local_run_dir / "rendered"
    if not rendered.is_dir():
        return []

    dist = _normalize_distribution(youtube_distribution)
    selected = list(youtube_account_ids or [])
    priv = _normalize_privacy(privacy_status)

    mp4_paths = sorted(rendered.rglob("*.mp4"), key=lambda p: p.as_posix())
    snippets = build_youtube_snippets_for_run(local_run_dir, run_title)

    # random_run: one account for all clips in this run
    run_account: str | None = None
    if dist == "random_run" and mp4_paths:
        ids = [x for x in selected if x.strip()] or account_ids_with_tokens()
        if not ids:
            raise PermissionError("No YouTube accounts connected.")
        run_account = random.Random(run_id).choice(ids)

    out: list[dict[str, str]] = []
    cfg = _load_config()

    for i, path in enumerate(mp4_paths):
        rel = path.relative_to(local_run_dir)
        rel_posix = str(rel).replace("\\", "/")
        snip = snippets[i] if i < len(snippets) else None
        title = snip["title"] if snip else (run_title or "Clip Engine")
        description = snip["description"] if snip else f"Exported from Clip Engine.\n{rel_posix}"

        if dist == "random_run" and run_account:
            acc_ids = [run_account]
        else:
            acc_ids = pick_accounts_for_clip(dist, selected, clip_index=i, run_id=run_id)

        for account_id in acc_ids:
            cfg = _load_config()
            a = _account_by_id(cfg, account_id)
            ch_title = ""
            if a:
                ch_title = str(a.get("channel_title") or "")
            creds = _get_credentials_for_account(account_id)
            youtube = build("youtube", "v3", credentials=creds, cache_discovery=False)

            body = {
                "snippet": {
                    "title": title,
                    "description": description,
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
                    "path": rel_posix,
                    "videoId": vid,
                    "watchUrl": watch,
                    "accountId": account_id,
                    "channelTitle": ch_title,
                }
            )
            log.info("Uploaded to YouTube: %s → %s (%s)", path.name, watch, account_id)

    return out
