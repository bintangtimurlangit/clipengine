"""Apply LLM / Tavily / pipeline settings from SQLite so the engine sees the correct environment."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from clipengine_api.core import db
from clipengine_api.core.llm_profiles import (
    apply_llm_chain_to_environ,
    apply_openai_transcription_env_from_chain,
    normalize_stored_llm_profiles,
)

log = logging.getLogger(__name__)

# Copied to os.environ from SQLite except these (handled via multi-profile chain).
_LEGACY_LLM_FLAT_JSON_KEYS = frozenset(
    {
        "llm_provider",
        "openai_api_key",
        "openai_base_url",
        "openai_model",
        "anthropic_api_key",
        "anthropic_base_url",
        "anthropic_model",
    }
)

_BASE_ENV_KEYS = (
    ("LLM_PROVIDER", "llm_provider"),
    ("OPENAI_API_KEY", "openai_api_key"),
    ("OPENAI_BASE_URL", "openai_base_url"),
    ("OPENAI_MODEL", "openai_model"),
    ("ANTHROPIC_API_KEY", "anthropic_api_key"),
    ("ANTHROPIC_BASE_URL", "anthropic_base_url"),
    ("ANTHROPIC_MODEL", "anthropic_model"),
    ("CLIPENGINE_TRANSCRIPTION_BACKEND", "transcription_backend"),
)

# Web search: provider ids, optional keys, and legacy SEARCH_PROVIDER (Docker).
_SEARCH_ENV_KEYS = (
    ("SEARCH_PROVIDER_MAIN", "search_provider_main"),
    ("SEARCH_PROVIDER_FALLBACK", "search_provider_fallback"),
    ("SEARCH_PROVIDER", "search_provider"),
    ("DUCKDUCKGO_BACKEND", "duckduckgo_backend"),
    ("BRAVE_SEARCH_COUNTRY", "brave_search_country"),
    ("TAVILY_API_KEY", "tavily_api_key"),
    ("BRAVE_API_KEY", "brave_api_key"),
    ("BRAVE_SEARCH_API_KEY", "brave_search_api_key"),
    ("EXA_API_KEY", "exa_api_key"),
    ("FIRECRAWL_API_KEY", "firecrawl_api_key"),
    ("GEMINI_API_KEY", "gemini_api_key"),
    ("XAI_API_KEY", "xai_api_key"),
    ("MOONSHOT_API_KEY", "moonshot_api_key"),
    ("KIMI_API_KEY", "kimi_api_key"),
    ("MINIMAX_CODE_PLAN_KEY", "minimax_code_plan_key"),
    ("MINIMAX_CODING_API_KEY", "minimax_coding_api_key"),
    ("MINIMAX_API_KEY", "minimax_api_key"),
    ("OLLAMA_API_KEY", "ollama_api_key"),
    ("PERPLEXITY_API_KEY", "perplexity_api_key"),
    ("OPENROUTER_API_KEY", "openrouter_api_key"),
    ("SEARXNG_BASE_URL", "searxng_base_url"),
)

_ENV_KEYS = _BASE_ENV_KEYS + _SEARCH_ENV_KEYS

# Numeric pipeline tuning: JSON key -> os.environ name (string values).
_PIPELINE_ENV_KEYS = (
    ("clipengine_LONGFORM_MIN_S", "longform_min_s"),
    ("clipengine_LONGFORM_MAX_S", "longform_max_s"),
    ("clipengine_SHORTFORM_MIN_S", "shortform_min_s"),
    ("clipengine_SHORTFORM_MAX_S", "shortform_max_s"),
    ("clipengine_SNAP_DURATION_SLACK_S", "snap_duration_slack_s"),
    ("CLIPENGINE_MAX_UPLOAD_BYTES", "max_upload_bytes"),
)

DEFAULT_LONGFORM_MIN_S = 180.0
DEFAULT_LONGFORM_MAX_S = 360.0
DEFAULT_SHORTFORM_MIN_S = 27.0
DEFAULT_SHORTFORM_MAX_S = 80.0
DEFAULT_SNAP_DURATION_SLACK_S = 3.0
DEFAULT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024

# Validation bounds for Settings API
MIN_UPLOAD_BYTES = 1 * 1024 * 1024  # 1 MiB
MAX_UPLOAD_BYTES_CAP = 50 * 1024 * 1024 * 1024  # 50 GiB


def _parse_stored_dict(raw: str | None) -> dict[str, Any]:
    if not raw or not str(raw).strip():
        return {}
    try:
        out = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return out if isinstance(out, dict) else {}


def _effective_float(
    stored: dict[str, Any],
    json_key: str,
    env_name: str,
    default: float,
) -> float:
    v = stored.get(json_key)
    if v is not None and str(v).strip() != "":
        return float(v)
    ev = os.environ.get(env_name)
    if ev is not None and str(ev).strip() != "":
        return float(str(ev).strip())
    return default


def _effective_int(
    stored: dict[str, Any],
    json_key: str,
    env_name: str,
    default: int,
) -> int:
    v = stored.get(json_key)
    if v is not None and str(v).strip() != "":
        return int(float(v))
    ev = os.environ.get(env_name)
    if ev is not None and str(ev).strip() != "":
        return int(float(str(ev).strip()))
    return default


def pipeline_settings_effective(stored: dict[str, Any]) -> dict[str, float | int]:
    """Resolved pipeline tuning for API responses (stored overrides env overrides defaults)."""
    return {
        "longformMinS": _effective_float(
            stored, "longform_min_s", "clipengine_LONGFORM_MIN_S", DEFAULT_LONGFORM_MIN_S
        ),
        "longformMaxS": _effective_float(
            stored, "longform_max_s", "clipengine_LONGFORM_MAX_S", DEFAULT_LONGFORM_MAX_S
        ),
        "shortformMinS": _effective_float(
            stored, "shortform_min_s", "clipengine_SHORTFORM_MIN_S", DEFAULT_SHORTFORM_MIN_S
        ),
        "shortformMaxS": _effective_float(
            stored, "shortform_max_s", "clipengine_SHORTFORM_MAX_S", DEFAULT_SHORTFORM_MAX_S
        ),
        "snapDurationSlackS": _effective_float(
            stored,
            "snap_duration_slack_s",
            "clipengine_SNAP_DURATION_SLACK_S",
            DEFAULT_SNAP_DURATION_SLACK_S,
        ),
        "maxUploadBytes": _effective_int(
            stored, "max_upload_bytes", "CLIPENGINE_MAX_UPLOAD_BYTES", DEFAULT_MAX_UPLOAD_BYTES
        ),
    }


def effective_max_upload_bytes() -> int:
    """Upload limit for incoming video files (stored JSON, then env, then default)."""
    stored = _parse_stored_dict(db.get_llm_settings_json())
    return int(
        pipeline_settings_effective(stored)["maxUploadBytes"],
    )


def apply_stored_llm_env() -> None:
    """Overlay non-empty values from DB onto ``os.environ`` (for ``clipengine`` and routes)."""
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
        if json_key in _LEGACY_LLM_FLAT_JSON_KEYS:
            continue
        val = data.get(json_key)
        if val is None:
            continue
        s = str(val).strip()
        if not s:
            continue
        os.environ[env_name] = s

    for env_name, json_key in _PIPELINE_ENV_KEYS:
        val = data.get(json_key)
        if val is None:
            continue
        s = str(val).strip()
        if not s:
            continue
        os.environ[env_name] = s

    norm = normalize_stored_llm_profiles(data)
    apply_llm_chain_to_environ(norm)
    apply_openai_transcription_env_from_chain(norm)
