"""Apply LLM / Tavily settings from SQLite so the pipeline sees the correct environment."""

from __future__ import annotations

import json
import logging
import os

from clipengine_api.core import db

log = logging.getLogger(__name__)

_ENV_KEYS = (
    ("LLM_PROVIDER", "llm_provider"),
    ("OPENAI_API_KEY", "openai_api_key"),
    ("OPENAI_BASE_URL", "openai_base_url"),
    ("OPENAI_MODEL", "openai_model"),
    ("ANTHROPIC_API_KEY", "anthropic_api_key"),
    ("ANTHROPIC_BASE_URL", "anthropic_base_url"),
    ("ANTHROPIC_MODEL", "anthropic_model"),
    ("TAVILY_API_KEY", "tavily_api_key"),
)


def apply_stored_llm_env() -> None:
    """Overlay non-empty values from DB onto ``os.environ`` (for ``clipengine``)."""
    raw = db.get_llm_settings_json()
    if not raw or not str(raw).strip():
        return
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        log.warning("invalid llm_settings_json in database")
        return
    if not isinstance(data, dict):
        return
    for env_name, json_key in _ENV_KEYS:
        val = data.get(json_key)
        if val is None:
            continue
        s = str(val).strip()
        if not s:
            continue
        os.environ[env_name] = s
