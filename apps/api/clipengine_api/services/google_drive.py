"""Google Drive OAuth2 integration — user-supplied credentials (BYOC).

Users bring their own Google Cloud project:
  1. Create a Google Cloud project and enable the Drive API.
  2. Create OAuth 2.0 credentials (type: *Web application*).
  3. Add ``{CLIPENGINE_PUBLIC_URL}/api/google-drive/callback`` as an Authorized Redirect URI.
  4. Copy the Client ID and Client Secret into ClipEngine Settings → Google Drive.
  5. Click "Connect" — authorize in the browser — done.

No ClipEngine accounts or Google Cloud quotas are consumed.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from clipengine_api.core import db

log = logging.getLogger(__name__)

# Read-only for browsing imports; drive.file allows uploading rendered outputs the app creates.
SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.file",
]

_VIDEO_MIMETYPES_PREFIX = ("video/",)
_VIDEO_EXTENSIONS = {".mp4", ".mkv", ".webm", ".mov", ".avi", ".m4v", ".ts", ".flv"}


# ---------------------------------------------------------------------------
# URL / ID parsing
# ---------------------------------------------------------------------------


def parse_file_id(url_or_id: str) -> str:
    """Extract a Google Drive file ID from a share URL, or return the input as-is.

    Supported URL formats:

    - ``https://drive.google.com/file/d/{ID}/view``
    - ``https://drive.google.com/open?id={ID}``
    - ``https://drive.google.com/uc?id={ID}``
    - Raw 28–44 character file ID
    """
    url_or_id = url_or_id.strip()
    # /file/d/{ID}
    m = re.search(r"/file/d/([a-zA-Z0-9_-]{20,})", url_or_id)
    if m:
        return m.group(1)
    # ?id={ID} or &id={ID}
    m = re.search(r"[?&]id=([a-zA-Z0-9_-]{20,})", url_or_id)
    if m:
        return m.group(1)
    # Assume already a raw file ID
    return url_or_id


def parse_folder_id(url_or_id: str) -> str:
    """Extract a Google Drive folder ID from a folder URL, or return the input."""
    url_or_id = url_or_id.strip()
    m = re.search(r"/folders/([a-zA-Z0-9_-]{10,})", url_or_id)
    if m:
        return m.group(1)
    m = re.search(r"[?&]id=([a-zA-Z0-9_-]{10,})", url_or_id)
    if m:
        return m.group(1)
    return url_or_id


# ---------------------------------------------------------------------------
# Stored config helpers
# ---------------------------------------------------------------------------


def _load_config() -> dict[str, Any]:
    raw = db.get_google_drive_config_json()
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def _save_config(cfg: dict[str, Any]) -> None:
    db.save_google_drive_config_json(json.dumps(cfg))


def has_client_credentials() -> bool:
    """True if client_id + client_secret have been saved."""
    cfg = _load_config()
    return bool(cfg.get("client_id") and cfg.get("client_secret"))


def is_connected() -> bool:
    """True if a refresh_token is stored (OAuth flow completed)."""
    cfg = _load_config()
    return bool(cfg.get("refresh_token"))


def save_client_credentials(client_id: str, client_secret: str) -> None:
    """Persist OAuth2 client credentials; clears any existing tokens."""
    cfg = _load_config()
    cfg["client_id"] = client_id.strip()
    cfg["client_secret"] = client_secret.strip()
    # Invalidate old tokens — they belong to the old app registration
    cfg.pop("token", None)
    cfg.pop("refresh_token", None)
    _save_config(cfg)


def revoke_connection() -> None:
    """Clear stored OAuth tokens without removing client credentials."""
    cfg = _load_config()
    cfg.pop("token", None)
    cfg.pop("refresh_token", None)
    _save_config(cfg)


# ---------------------------------------------------------------------------
# OAuth2 flow
# ---------------------------------------------------------------------------


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
    """Return the Google OAuth2 authorization URL.

    The user must open this URL in their browser and approve the Drive
    read-only scope. Google will redirect to ``redirect_uri`` with a
    one-time ``code`` parameter that :func:`exchange_code` exchanges for tokens.
    """
    from google_auth_oauthlib.flow import Flow  # type: ignore[import-untyped]

    cfg = _load_config()
    if not cfg.get("client_id") or not cfg.get("client_secret"):
        raise ValueError(
            "Google Drive client credentials not configured. "
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
        prompt="consent",  # always show consent so we always get a refresh_token
    )
    return auth_url


def exchange_code(code: str, redirect_uri: str) -> None:
    """Exchange the authorization ``code`` for tokens and persist them."""
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
    log.info("Google Drive connected — refresh_token stored.")


# ---------------------------------------------------------------------------
# Authenticated Google API helpers
# ---------------------------------------------------------------------------


def _get_credentials():
    """Return a valid :class:`google.oauth2.credentials.Credentials` instance."""
    from google.auth.transport.requests import Request  # type: ignore[import-untyped]
    from google.oauth2.credentials import Credentials  # type: ignore[import-untyped]

    cfg = _load_config()
    if not cfg.get("refresh_token"):
        raise PermissionError(
            "Google Drive is not connected — complete the OAuth flow first."
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


# ---------------------------------------------------------------------------
# Drive API operations
# ---------------------------------------------------------------------------


def list_files(folder_id: str = "root") -> list[dict[str, Any]]:
    """List video files and sub-folders in a Google Drive folder.

    Returns a list of dicts with ``id``, ``name``, ``mimeType``, ``size``,
    ``modifiedTime``, and a synthetic ``kind`` field (``folder`` / ``file``).
    """
    from googleapiclient.discovery import build  # type: ignore[import-untyped]

    creds = _get_credentials()
    service = build("drive", "v3", credentials=creds, cache_discovery=False)

    q = (
        f"'{folder_id}' in parents and trashed = false"
        " and (mimeType contains 'video/' or mimeType = 'application/vnd.google-apps.folder')"
    )
    result = (
        service.files()
        .list(
            q=q,
            fields="files(id, name, mimeType, size, modifiedTime)",
            orderBy="folder,name",
            pageSize=200,
        )
        .execute()
    )

    files = []
    for f in result.get("files", []):
        f["kind"] = (
            "folder"
            if f.get("mimeType") == "application/vnd.google-apps.folder"
            else "file"
        )
        files.append(f)
    return files


def get_file_metadata(file_id: str) -> dict[str, Any]:
    """Return Drive file metadata for ``file_id``."""
    from googleapiclient.discovery import build  # type: ignore[import-untyped]

    creds = _get_credentials()
    service = build("drive", "v3", credentials=creds, cache_discovery=False)
    return (
        service.files()
        .get(fileId=file_id, fields="id, name, mimeType, size, modifiedTime")
        .execute()
    )


def download_file(file_id: str, dest_dir: Path) -> Path:
    """Download a Google Drive video file to *dest_dir*.

    Returns the path of the downloaded file.

    Raises :class:`ValueError` if the file is not a video.
    """
    from googleapiclient.discovery import build  # type: ignore[import-untyped]
    from googleapiclient.http import MediaIoBaseDownload  # type: ignore[import-untyped]

    creds = _get_credentials()
    service = build("drive", "v3", credentials=creds, cache_discovery=False)

    meta = get_file_metadata(file_id)
    name: str = meta.get("name", f"{file_id}.mp4")
    mimetype: str = meta.get("mimeType", "")

    if not any(mimetype.startswith(p) for p in _VIDEO_MIMETYPES_PREFIX):
        raise ValueError(
            f"'{name}' is not a video file (mimeType: {mimetype}). "
            "Only video/* files can be imported."
        )

    safe_name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / safe_name

    request = service.files().get_media(fileId=file_id)
    with open(dest, "wb") as fh:
        downloader = MediaIoBaseDownload(fh, request, chunksize=32 * 1024 * 1024)
        done = False
        while not done:
            status, done = downloader.next_chunk()
            if status:
                log.debug("Google Drive download %d%%", int(status.progress() * 100))

    log.info("Downloaded Google Drive '%s' → %s (%d bytes)", name, dest, dest.stat().st_size)
    return dest


def upload_rendered_mp4s(local_run_dir: Path, drive_folder_id: str) -> list[str]:
    """Upload every ``*.mp4`` under ``local_run_dir/rendered`` into *drive_folder_id*.

    Returns remote file names uploaded. Requires ``drive.file`` scope (re-authorize if you
    connected with read-only scope only).
    """
    from googleapiclient.discovery import build  # type: ignore[import-untyped]
    from googleapiclient.http import MediaFileUpload  # type: ignore[import-untyped]

    rendered = local_run_dir / "rendered"
    if not rendered.is_dir():
        return []

    creds = _get_credentials()
    service = build("drive", "v3", credentials=creds, cache_discovery=False)
    folder_id = parse_folder_id(drive_folder_id)

    uploaded: list[str] = []
    for path in sorted(rendered.rglob("*.mp4")):
        rel = path.relative_to(rendered)
        name = str(rel).replace("\\", "_").replace("/", "_")
        body = {"name": name, "parents": [folder_id]}
        media = MediaFileUpload(str(path), mimetype="video/mp4", resumable=True)
        service.files().create(body=body, media_body=media, fields="id", supportsAllDrives=True).execute()
        uploaded.append(name)
        log.info("Uploaded to Google Drive: %s", name)
    return uploaded
