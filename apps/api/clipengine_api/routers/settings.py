"""Persisted engine settings (LLM provider, keys, optional Tavily)."""

from __future__ import annotations

import json
import os
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from clipengine_api.core import db
from clipengine_api.core.llm_status import is_llm_configured

router = APIRouter(tags=["settings"])


class LlmSettingsPatch(BaseModel):
    llm_provider: str | None = Field(
        default=None,
        description="'openai' or 'anthropic'",
    )
    openai_api_key: str | None = None
    openai_base_url: str | None = None
    openai_model: str | None = None
    anthropic_api_key: str | None = None
    anthropic_base_url: str | None = None
    anthropic_model: str | None = None
    tavily_api_key: str | None = None
    clear_openai_api_key: bool = False
    clear_anthropic_api_key: bool = False
    clear_tavily_api_key: bool = False


def _load_dict() -> dict[str, Any]:
    raw = db.get_llm_settings_json()
    if not raw or not str(raw).strip():
        return {}
    try:
        out = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return out if isinstance(out, dict) else {}


def _save_dict(data: dict[str, Any]) -> None:
    db.save_llm_settings_json(json.dumps(data, ensure_ascii=False))


def _key_configured(stored: dict[str, Any], env_name: str, json_key: str) -> bool:
    v = stored.get(json_key)
    if v is not None and str(v).strip():
        return True
    ev = os.environ.get(env_name)
    return bool(ev and str(ev).strip())


@router.get("/settings/llm-status")
def get_llm_status() -> dict[str, Any]:
    """Lightweight check for the dashboard before starting a pipeline."""
    complete, _ = db.get_setup_state()
    if not complete:
        raise HTTPException(status_code=403, detail="Complete setup first")
    return {"configured": is_llm_configured()}


@router.get("/settings")
def get_settings() -> dict[str, Any]:
    complete, _ = db.get_setup_state()
    if not complete:
        raise HTTPException(status_code=403, detail="Complete setup first")
    stored = _load_dict()
    lp = stored.get("llm_provider") or os.environ.get("LLM_PROVIDER") or "openai"
    if str(lp).lower() in ("anthropic", "claude"):
        lp = "anthropic"
    else:
        lp = "openai"
    return {
        "llmProvider": lp,
        "openaiBaseUrl": stored.get("openai_base_url") or os.environ.get("OPENAI_BASE_URL") or "",
        "openaiModel": stored.get("openai_model") or os.environ.get("OPENAI_MODEL") or "gpt-4o-mini",
        "openaiKeyConfigured": _key_configured(stored, "OPENAI_API_KEY", "openai_api_key"),
        "anthropicBaseUrl": stored.get("anthropic_base_url")
        or os.environ.get("ANTHROPIC_BASE_URL")
        or "",
        "anthropicModel": stored.get("anthropic_model")
        or os.environ.get("ANTHROPIC_MODEL")
        or "claude-3-5-sonnet-20241022",
        "anthropicKeyConfigured": _key_configured(
            stored, "ANTHROPIC_API_KEY", "anthropic_api_key"
        ),
        "tavilyKeyConfigured": _key_configured(stored, "TAVILY_API_KEY", "tavily_api_key"),
        "workspacePath": os.environ.get("CLIPENGINE_WORKSPACE", "/workspace"),
        "dataPath": os.environ.get("CLIPENGINE_DATA_DIR", "/data"),
    }


@router.put("/settings")
def put_settings(body: LlmSettingsPatch) -> dict[str, str]:
    complete, _ = db.get_setup_state()
    if not complete:
        raise HTTPException(status_code=403, detail="Complete setup first")

    cur = _load_dict()
    p = body.model_dump(exclude_unset=True)

    if p.get("clear_openai_api_key"):
        cur.pop("openai_api_key", None)
    if p.get("clear_anthropic_api_key"):
        cur.pop("anthropic_api_key", None)
    if p.get("clear_tavily_api_key"):
        cur.pop("tavily_api_key", None)

    if "llm_provider" in p and p["llm_provider"] is not None:
        lp = str(p["llm_provider"]).lower().strip()
        if lp in ("openai", "anthropic"):
            cur["llm_provider"] = lp

    def merge_secret(json_key: str, patch_key: str) -> None:
        if patch_key not in p:
            return
        val = p[patch_key]
        if val is None:
            return
        s = str(val).strip()
        if s:
            cur[json_key] = s

    merge_secret("openai_api_key", "openai_api_key")
    merge_secret("anthropic_api_key", "anthropic_api_key")
    merge_secret("tavily_api_key", "tavily_api_key")

    def merge_optional_str(json_key: str, patch_key: str) -> None:
        if patch_key not in p:
            return
        val = p[patch_key]
        if val is None:
            return
        s = str(val).strip()
        if s:
            cur[json_key] = s
        else:
            cur.pop(json_key, None)

    merge_optional_str("openai_base_url", "openai_base_url")
    merge_optional_str("openai_model", "openai_model")
    merge_optional_str("anthropic_base_url", "anthropic_base_url")
    merge_optional_str("anthropic_model", "anthropic_model")

    _save_dict(cur)
    return {"status": "ok"}
