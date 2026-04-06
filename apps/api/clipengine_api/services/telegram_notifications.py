"""Telegram Bot API notifications (optional; stored in llm_settings_json or env)."""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from typing import Any

from clipengine_api.core import db

log = logging.getLogger(__name__)

_JSON_ENABLED = "telegram_notifications_enabled"
_JSON_CHAT = "telegram_chat_id"
_JSON_TOKEN = "telegram_bot_token"

_ENV_TOKEN = "TELEGRAM_BOT_TOKEN"
_ENV_CHAT = "TELEGRAM_CHAT_ID"

_TELEGRAM_API = "https://api.telegram.org"


def _load_settings_dict() -> dict[str, Any]:
    raw = db.get_llm_settings_json()
    if not raw or not str(raw).strip():
        return {}
    try:
        out = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return out if isinstance(out, dict) else {}


def _save_settings_dict(data: dict[str, Any]) -> None:
    db.save_llm_settings_json(json.dumps(data, ensure_ascii=False))


def telegram_status() -> dict[str, Any]:
    """Fields for GET /api/notifications/telegram (no secrets)."""
    stored = _load_settings_dict()
    enabled = bool(stored.get(_JSON_ENABLED))
    chat = str(stored.get(_JSON_CHAT) or "").strip()
    token_stored = bool(str(stored.get(_JSON_TOKEN) or "").strip())
    token_env = bool(str(os.environ.get(_ENV_TOKEN) or "").strip())
    chat_env = bool(str(os.environ.get(_ENV_CHAT) or "").strip())
    return {
        "enabled": enabled,
        "chatId": chat,
        "botTokenConfigured": token_stored,
        "botTokenFromEnv": token_env,
        "chatIdFromEnv": chat_env,
    }


def _effective_token(stored: dict[str, Any]) -> str | None:
    t = str(stored.get(_JSON_TOKEN) or "").strip()
    if t:
        return t
    ev = str(os.environ.get(_ENV_TOKEN) or "").strip()
    return ev or None


def _effective_chat_id(stored: dict[str, Any]) -> str | None:
    c = str(stored.get(_JSON_CHAT) or "").strip()
    if c:
        return c
    ev = str(os.environ.get(_ENV_CHAT) or "").strip()
    return ev or None


def is_telegram_ready_to_send(stored: dict[str, Any] | None = None) -> bool:
    if stored is None:
        stored = _load_settings_dict()
    if not bool(stored.get(_JSON_ENABLED)):
        return False
    return bool(_effective_token(stored) and _effective_chat_id(stored))


def send_telegram_message(text: str) -> None:
    """POST sendMessage. Raises on HTTP/API errors (caller may catch)."""
    stored = _load_settings_dict()
    if not is_telegram_ready_to_send(stored):
        return
    token = _effective_token(stored)
    chat_id = _effective_chat_id(stored)
    if not token or not chat_id:
        return
    url = f"{_TELEGRAM_API}/bot{token}/sendMessage"
    body = json.dumps(
        {"chat_id": chat_id, "text": text},
        ensure_ascii=False,
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Telegram API returned non-JSON: {raw[:200]}") from e
    if not payload.get("ok"):
        desc = payload.get("description") or raw
        raise RuntimeError(str(desc))


def send_telegram_message_best_effort(text: str) -> None:
    """Log errors; never raises."""
    try:
        send_telegram_message(text)
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            body = ""
        log.warning("Telegram notification failed HTTP %s: %s", e.code, body[:500])
    except urllib.error.URLError as e:
        log.warning("Telegram notification failed: %s", e)
    except OSError as e:
        log.warning("Telegram notification failed: %s", e)
    except RuntimeError as e:
        log.warning("Telegram notification failed: %s", e)
    except Exception:
        log.exception("Telegram notification failed")


def notify_run_finished(run_id: str, *, success: bool, error: str | None = None) -> None:
    """Pipeline hook: best-effort Telegram message."""
    if not is_telegram_ready_to_send():
        return
    if success:
        text = f"Clip Engine: run {run_id} completed successfully."
    else:
        err = (error or "").strip()
        if len(err) > 1500:
            err = err[:1497] + "..."
        text = f"Clip Engine: run {run_id} failed.\n{err}" if err else f"Clip Engine: run {run_id} failed."
    send_telegram_message_best_effort(text)


def apply_telegram_patch(
    *,
    enabled: bool | None = None,
    chat_id: str | None = None,
    bot_token: str | None = None,
    clear_bot_token: bool = False,
) -> None:
    cur = _load_settings_dict()
    if enabled is not None:
        cur[_JSON_ENABLED] = bool(enabled)
    if chat_id is not None:
        s = str(chat_id).strip()
        if s:
            cur[_JSON_CHAT] = s
        else:
            cur.pop(_JSON_CHAT, None)
    if clear_bot_token:
        cur.pop(_JSON_TOKEN, None)
    if bot_token is not None:
        s = str(bot_token).strip()
        if s:
            cur[_JSON_TOKEN] = s
    _save_settings_dict(cur)
