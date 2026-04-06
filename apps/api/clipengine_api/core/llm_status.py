"""Whether the configured LLM provider has an API key (SQLite or process env)."""

from __future__ import annotations

import json
import os
from typing import Any

from clipengine_api.core import db


def _load_stored() -> dict[str, Any]:
    raw = db.get_llm_settings_json()
    if not raw or not str(raw).strip():
        return {}
    try:
        out = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return out if isinstance(out, dict) else {}


def _key_configured(stored: dict[str, Any], env_name: str, json_key: str) -> bool:
    v = stored.get(json_key)
    if v is not None and str(v).strip():
        return True
    ev = os.environ.get(env_name)
    return bool(ev and str(ev).strip())


def is_llm_configured() -> bool:
    stored = _load_stored()
    lp = stored.get("llm_provider") or os.environ.get("LLM_PROVIDER") or "openai"
    if str(lp).lower() in ("anthropic", "claude"):
        return _key_configured(stored, "ANTHROPIC_API_KEY", "anthropic_api_key")
    return _key_configured(stored, "OPENAI_API_KEY", "openai_api_key")
