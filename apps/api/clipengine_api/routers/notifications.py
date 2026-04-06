"""Telegram notification settings (stored in llm_settings_json)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from clipengine_api.core import db
from clipengine_api.services import telegram_notifications as tg

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _require_setup() -> None:
    complete, _ = db.get_setup_state()
    if not complete:
        raise HTTPException(status_code=403, detail="Complete setup first")


class TelegramConfigBody(BaseModel):
    enabled: bool = False
    chat_id: str = Field(default="", description="Telegram chat_id for DMs or groups")
    bot_token: str = Field(
        default="",
        description="Leave blank to keep stored token when updating other fields.",
    )
    clear_bot_token: bool = False


@router.get("/telegram")
def get_telegram() -> dict[str, Any]:
    _require_setup()
    return tg.telegram_status()


@router.put("/telegram")
def put_telegram(body: TelegramConfigBody) -> dict[str, str]:
    _require_setup()
    tg.apply_telegram_patch(
        enabled=body.enabled,
        chat_id=body.chat_id,
        bot_token=body.bot_token,
        clear_bot_token=body.clear_bot_token,
    )
    if body.enabled and not tg.is_telegram_ready_to_send():
        raise HTTPException(
            status_code=400,
            detail="Enable requires a bot token and chat ID (stored in Settings, or "
            "set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in the environment).",
        )
    return {"status": "ok"}


@router.post("/telegram/test")
def post_telegram_test() -> dict[str, str]:
    _require_setup()
    if not tg.is_telegram_ready_to_send():
        raise HTTPException(
            status_code=400,
            detail="Telegram is not configured or disabled. Save token, chat ID, and enable notifications.",
        )
    try:
        tg.send_telegram_message("Clip Engine: test notification.")
    except OSError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"status": "ok"}
