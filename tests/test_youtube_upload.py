"""Unit tests for clipengine_api.services.youtube_upload (no network)."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture()
def in_memory_db(tmp_path, monkeypatch):
    db_file = tmp_path / "test.db"
    monkeypatch.setenv("CLIPENGINE_DATA_DIR", str(tmp_path))
    from clipengine_api.core import db as db_module

    db_module.init_db()
    return db_file


def test_normalize_privacy() -> None:
    from clipengine_api.services.youtube_upload import _normalize_privacy

    assert _normalize_privacy("PRIVATE") == "private"
    assert _normalize_privacy("unlisted") == "unlisted"
    assert _normalize_privacy("public") == "public"
    assert _normalize_privacy("bogus") == "private"


def test_has_client_credentials_false_when_empty(in_memory_db) -> None:
    from clipengine_api.services.youtube_upload import has_client_credentials

    assert has_client_credentials() is False


def test_save_client_credentials(in_memory_db) -> None:
    from clipengine_api.services import youtube_upload as yt

    yt.save_client_credentials("id.apps.googleusercontent.com", "secret")
    assert yt.has_client_credentials() is True
    assert yt.is_connected() is False


def test_revoke_connection(in_memory_db) -> None:
    from clipengine_api.services import youtube_upload as yt
    from clipengine_api.core import db

    cfg = {"client_id": "id", "client_secret": "sec", "refresh_token": "rt"}
    db.save_youtube_config_json(json.dumps(cfg))
    assert yt.is_connected() is True
    yt.revoke_connection()
    assert yt.is_connected() is False
    assert yt.has_client_credentials() is True


def test_get_auth_url_requires_credentials(in_memory_db) -> None:
    from clipengine_api.services.youtube_upload import get_auth_url

    with pytest.raises(ValueError, match="client credentials not configured"):
        get_auth_url("http://localhost:8000/api/youtube/callback")


def test_get_auth_url_returns_google_url(in_memory_db) -> None:
    from clipengine_api.services.youtube_upload import get_auth_url, save_client_credentials

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
        url = get_auth_url("http://localhost:8000/api/youtube/callback")

    assert "accounts.google.com" in url
    mock_flow.authorization_url.assert_called_once()


def test_sanitize_title() -> None:
    from clipengine_api.services.youtube_upload import _sanitize_title

    assert _sanitize_title('ab<>c"d') == "abcd"
    assert _sanitize_title("   ") == "Clip"
