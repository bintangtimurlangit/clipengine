"""Unit tests for clipengine_api.services.google_drive helpers.

These tests do NOT require a real Google account or network access — they only
test pure-Python helper functions (file ID parsing, config helpers, etc.).
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# parse_file_id
# ---------------------------------------------------------------------------


def test_parse_file_id_from_file_view_url() -> None:
    from clipengine_api.services.google_drive import parse_file_id

    url = "https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/view?usp=sharing"
    assert parse_file_id(url) == "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"


def test_parse_file_id_from_open_url() -> None:
    from clipengine_api.services.google_drive import parse_file_id

    url = "https://drive.google.com/open?id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
    assert parse_file_id(url) == "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"


def test_parse_file_id_from_uc_url() -> None:
    from clipengine_api.services.google_drive import parse_file_id

    url = "https://drive.google.com/uc?id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms&export=download"
    assert parse_file_id(url) == "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"


def test_parse_file_id_raw_id_passthrough() -> None:
    from clipengine_api.services.google_drive import parse_file_id

    raw = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
    assert parse_file_id(raw) == raw


def test_parse_file_id_strips_whitespace() -> None:
    from clipengine_api.services.google_drive import parse_file_id

    raw = "  1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms  "
    assert parse_file_id(raw) == "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"


def test_parse_folder_id_from_url() -> None:
    from clipengine_api.services.google_drive import parse_folder_id

    url = "https://drive.google.com/drive/folders/1abcDEFghijklmnopQRSTuvwxyz1234"
    assert parse_folder_id(url) == "1abcDEFghijklmnopQRSTuvwxyz1234"


def test_parse_folder_id_raw() -> None:
    from clipengine_api.services.google_drive import parse_folder_id

    raw = "1abcDEFghijklmnopQRSTuvwxyz1234"
    assert parse_folder_id(raw) == raw


# ---------------------------------------------------------------------------
# Credential / connection state helpers  (with in-memory SQLite)
# ---------------------------------------------------------------------------


@pytest.fixture()
def in_memory_db(tmp_path, monkeypatch):
    """Point the DB at a temp file so tests don't touch real data."""
    db_file = tmp_path / "test.db"
    monkeypatch.setenv("CLIPENGINE_DATA_DIR", str(tmp_path))
    # Reset the DB so the new env var takes effect
    from clipengine_api.core import db as db_module
    db_module.init_db()
    return db_file


def test_has_client_credentials_false_when_empty(in_memory_db) -> None:
    from clipengine_api.services.google_drive import has_client_credentials
    assert has_client_credentials() is False


def test_save_client_credentials_sets_flag(in_memory_db) -> None:
    from clipengine_api.services.google_drive import has_client_credentials, save_client_credentials
    save_client_credentials("my-client-id", "my-secret")
    assert has_client_credentials() is True


def test_is_connected_false_before_oauth(in_memory_db) -> None:
    from clipengine_api.services.google_drive import is_connected, save_client_credentials
    save_client_credentials("my-client-id", "my-secret")
    assert is_connected() is False


def test_revoke_connection_clears_tokens(in_memory_db) -> None:
    from clipengine_api.services import google_drive as gdrive
    from clipengine_api.core import db

    # Manually insert a fake token
    cfg = {"client_id": "id", "client_secret": "sec", "refresh_token": "rt123"}
    db.save_google_drive_config_json(json.dumps(cfg))

    assert gdrive.is_connected() is True
    gdrive.revoke_connection()
    assert gdrive.is_connected() is False
    # Client credentials should survive revocation
    assert gdrive.has_client_credentials() is True


def test_save_credentials_clears_existing_tokens(in_memory_db) -> None:
    from clipengine_api.services import google_drive as gdrive
    from clipengine_api.core import db

    # Seed existing tokens
    cfg = {"client_id": "old-id", "client_secret": "old-sec", "refresh_token": "old-rt"}
    db.save_google_drive_config_json(json.dumps(cfg))

    # Overwrite credentials — tokens must be cleared
    gdrive.save_client_credentials("new-id", "new-sec")
    assert gdrive.is_connected() is False
    assert gdrive.has_client_credentials() is True


# ---------------------------------------------------------------------------
# get_auth_url (mock the OAuth flow — no network)
# ---------------------------------------------------------------------------


def test_get_auth_url_requires_credentials(in_memory_db) -> None:
    from clipengine_api.services.google_drive import get_auth_url
    with pytest.raises(ValueError, match="client credentials not configured"):
        get_auth_url("http://localhost:8000/api/google-drive/callback")


def test_get_auth_url_returns_google_url(in_memory_db) -> None:
    from clipengine_api.services.google_drive import get_auth_url, save_client_credentials

    save_client_credentials("fake-client-id.apps.googleusercontent.com", "fake-secret")

    mock_flow = MagicMock()
    mock_flow.authorization_url.return_value = (
        "https://accounts.google.com/o/oauth2/auth?client_id=test",
        "state-token",
    )

    with patch(
        "google_auth_oauthlib.flow.Flow.from_client_config",
        return_value=mock_flow,
    ):
        url = get_auth_url("http://localhost:8000/api/google-drive/callback")

    assert "accounts.google.com" in url
    mock_flow.authorization_url.assert_called_once()
