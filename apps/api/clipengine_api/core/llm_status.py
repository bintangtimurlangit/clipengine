"""Whether the configured LLM provider has an API key (SQLite or process env)."""

from __future__ import annotations

import json
from typing import Any

from clipengine_api.core import db
from clipengine_api.core.llm_profiles import primary_api_key_configured


def _load_stored() -> dict[str, Any]:
    raw = db.get_llm_settings_json()
    if not raw or not str(raw).strip():
        return {}
    try:
        out = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return out if isinstance(out, dict) else {}


def is_llm_configured() -> bool:
    stored = _load_stored()
    return primary_api_key_configured(stored)
