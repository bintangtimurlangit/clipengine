"""Persisted engine settings (LLM provider, keys, optional Tavily)."""

from __future__ import annotations

import json
import os
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from clipengine_api.core import db
from clipengine_api.core.env import (
    MAX_UPLOAD_BYTES_CAP,
    MIN_UPLOAD_BYTES,
    pipeline_settings_effective,
)
from clipengine_api.core.llm_status import is_llm_configured
from clipengine_api.services.publish_metadata import (
    MAX_DESCRIPTION_LEN,
    merge_publish_from_stored,
)
from clipengine.plan.search_providers.registry import normalize_provider_id

router = APIRouter(tags=["settings"])

_KNOWN_SEARCH_PROVIDERS = frozenset(
    {
        "auto",
        "none",
        "tavily",
        "brave",
        "duckduckgo",
        "exa",
        "firecrawl",
        "gemini",
        "grok",
        "kimi",
        "minimax",
        "ollama_web",
        "perplexity",
        "searxng",
    }
)

_SEARCH_SECRET_JSON_KEYS = frozenset(
    {
        "tavily_api_key",
        "brave_api_key",
        "brave_search_api_key",
        "exa_api_key",
        "firecrawl_api_key",
        "gemini_api_key",
        "xai_api_key",
        "moonshot_api_key",
        "kimi_api_key",
        "minimax_code_plan_key",
        "minimax_coding_api_key",
        "minimax_api_key",
        "ollama_api_key",
        "perplexity_api_key",
        "openrouter_api_key",
        "searxng_base_url",
    }
)


def _validate_search_provider_token(raw: str | None, *, label: str) -> str | None:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return ""
    n = normalize_provider_id(s)
    if n not in _KNOWN_SEARCH_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"{label} must be auto, none, or a supported search provider id",
        )
    return s


def _effective_search_main(stored: dict[str, Any]) -> str:
    for key in ("search_provider_main", "search_provider"):
        v = stored.get(key)
        if v is not None and str(v).strip():
            return str(v).strip()
    for env_name in ("SEARCH_PROVIDER_MAIN", "SEARCH_PROVIDER"):
        ev = os.environ.get(env_name)
        if ev and str(ev).strip():
            return str(ev).strip()
    return "auto"


def _effective_search_fallback(stored: dict[str, Any]) -> str:
    v = stored.get("search_provider_fallback")
    if v is not None and str(v).strip():
        return str(v).strip()
    ev = os.environ.get("SEARCH_PROVIDER_FALLBACK")
    if ev and str(ev).strip():
        return str(ev).strip()
    return "none"


def _normalize_transcription_backend(raw: str | None) -> str:
    if not raw or not str(raw).strip():
        return "local"
    x = str(raw).lower().strip()
    if x == "openai_api":
        return "openai_api"
    return "local"


class LlmSettingsPatch(BaseModel):
    llm_provider: str | None = Field(
        default=None,
        description="'openai' or 'anthropic'",
    )
    transcription_backend: str | None = Field(
        default=None,
        description="'local' (faster-whisper) or 'openai_api' (OpenAI /v1/audio/transcriptions)",
    )
    openai_api_key: str | None = None
    openai_base_url: str | None = None
    openai_model: str | None = None
    anthropic_api_key: str | None = None
    anthropic_base_url: str | None = None
    anthropic_model: str | None = None
    tavily_api_key: str | None = None
    search_provider_main: str | None = None
    search_provider_fallback: str | None = None
    duckduckgo_backend: str | None = None
    brave_search_country: str | None = None
    brave_api_key: str | None = None
    brave_search_api_key: str | None = None
    exa_api_key: str | None = None
    firecrawl_api_key: str | None = None
    gemini_api_key: str | None = None
    xai_api_key: str | None = None
    moonshot_api_key: str | None = None
    kimi_api_key: str | None = None
    minimax_code_plan_key: str | None = None
    minimax_coding_api_key: str | None = None
    minimax_api_key: str | None = None
    ollama_api_key: str | None = None
    perplexity_api_key: str | None = None
    openrouter_api_key: str | None = None
    searxng_base_url: str | None = None
    clear_openai_api_key: bool = False
    clear_anthropic_api_key: bool = False
    clear_tavily_api_key: bool = False
    clear_search_secrets: list[str] | None = None
    longform_min_s: float | None = None
    longform_max_s: float | None = None
    shortform_min_s: float | None = None
    shortform_max_s: float | None = None
    snap_duration_slack_s: float | None = None
    max_upload_bytes: int | None = None
    publish_title_source: str | None = Field(
        default=None,
        description="'ai_clip' or 'run_filename'",
    )
    publish_description_mode: str | None = Field(
        default=None,
        description="'full_ai', 'manual', or 'hybrid'",
    )
    publish_description_prefix: str | None = None
    publish_description_suffix: str | None = None
    publish_hybrid_include_ai: bool | None = None


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


_PIPELINE_JSON_KEYS = (
    "longform_min_s",
    "longform_max_s",
    "shortform_min_s",
    "shortform_max_s",
    "snap_duration_slack_s",
    "max_upload_bytes",
)


def _validate_pipeline_effective(eff: dict[str, float | int]) -> None:
    lf_min = float(eff["longformMinS"])
    lf_max = float(eff["longformMaxS"])
    sf_min = float(eff["shortformMinS"])
    sf_max = float(eff["shortformMaxS"])
    snap = float(eff["snapDurationSlackS"])
    max_up = int(eff["maxUploadBytes"])

    def bad(msg: str) -> None:
        raise HTTPException(status_code=400, detail=msg)

    for name, v in (
        ("longform min duration (s)", lf_min),
        ("longform max duration (s)", lf_max),
        ("shortform min duration (s)", sf_min),
        ("shortform max duration (s)", sf_max),
    ):
        if not (1.0 <= v <= 86400.0):
            bad(f"{name} must be between 1 and 86400")

    if lf_min >= lf_max:
        bad("longform min duration must be less than longform max duration")
    if sf_min >= sf_max:
        bad("shortform min duration must be less than shortform max duration")

    if not (0.1 <= snap <= 120.0):
        bad("snap duration slack must be between 0.1 and 120 seconds")

    if not (MIN_UPLOAD_BYTES <= max_up <= MAX_UPLOAD_BYTES_CAP):
        bad(
            f"max upload size must be between {MIN_UPLOAD_BYTES} and {MAX_UPLOAD_BYTES_CAP} bytes"
        )


def _validate_publish_settings(pub: dict[str, Any]) -> None:
    def bad(msg: str) -> None:
        raise HTTPException(status_code=400, detail=msg)

    ts = pub.get("publish_title_source")
    if ts not in ("ai_clip", "run_filename"):
        bad("publish_title_source must be ai_clip or run_filename")

    dm = pub.get("publish_description_mode")
    if dm not in ("full_ai", "manual", "hybrid"):
        bad("publish_description_mode must be full_ai, manual, or hybrid")

    for key, label in (
        ("publish_description_prefix", "publish description prefix"),
        ("publish_description_suffix", "publish description suffix"),
    ):
        v = pub.get(key) or ""
        if not isinstance(v, str):
            bad(f"{label} must be a string")
            return
        if len(v) > MAX_DESCRIPTION_LEN:
            bad(f"{label} must be at most {MAX_DESCRIPTION_LEN} characters")


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
    tb_src = stored.get("transcription_backend") or os.environ.get(
        "CLIPENGINE_TRANSCRIPTION_BACKEND"
    )
    tb = _normalize_transcription_backend(str(tb_src) if tb_src else None)
    pub = merge_publish_from_stored(stored)
    return {
        "llmProvider": lp,
        "transcriptionBackend": tb,
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
        "searchProviderMain": _effective_search_main(stored),
        "searchProviderFallback": _effective_search_fallback(stored),
        "braveKeyConfigured": _key_configured(stored, "BRAVE_API_KEY", "brave_api_key")
        or _key_configured(stored, "BRAVE_SEARCH_API_KEY", "brave_search_api_key"),
        "exaKeyConfigured": _key_configured(stored, "EXA_API_KEY", "exa_api_key"),
        "firecrawlKeyConfigured": _key_configured(
            stored, "FIRECRAWL_API_KEY", "firecrawl_api_key"
        ),
        "geminiKeyConfigured": _key_configured(stored, "GEMINI_API_KEY", "gemini_api_key"),
        "xaiKeyConfigured": _key_configured(stored, "XAI_API_KEY", "xai_api_key"),
        "moonshotKeyConfigured": _key_configured(
            stored, "MOONSHOT_API_KEY", "moonshot_api_key"
        ),
        "kimiKeyConfigured": _key_configured(stored, "KIMI_API_KEY", "kimi_api_key"),
        "minimaxKeyConfigured": _key_configured(
            stored, "MINIMAX_API_KEY", "minimax_api_key"
        )
        or _key_configured(stored, "MINIMAX_CODE_PLAN_KEY", "minimax_code_plan_key")
        or _key_configured(stored, "MINIMAX_CODING_API_KEY", "minimax_coding_api_key"),
        "ollamaKeyConfigured": _key_configured(stored, "OLLAMA_API_KEY", "ollama_api_key"),
        "perplexityKeyConfigured": _key_configured(
            stored, "PERPLEXITY_API_KEY", "perplexity_api_key"
        ),
        "openrouterKeyConfigured": _key_configured(
            stored, "OPENROUTER_API_KEY", "openrouter_api_key"
        ),
        "searxngConfigured": _key_configured(stored, "SEARXNG_BASE_URL", "searxng_base_url"),
        "duckduckgoBackend": stored.get("duckduckgo_backend")
        or os.environ.get("DUCKDUCKGO_BACKEND")
        or "auto",
        "braveSearchCountry": stored.get("brave_search_country")
        or os.environ.get("BRAVE_SEARCH_COUNTRY")
        or os.environ.get("BRAVE_COUNTRY")
        or "",
        "workspacePath": os.environ.get("CLIPENGINE_WORKSPACE", "/workspace"),
        "dataPath": os.environ.get("CLIPENGINE_DATA_DIR", "/data"),
        **pipeline_settings_effective(stored),
        "publishTitleSource": pub["publish_title_source"],
        "publishDescriptionMode": pub["publish_description_mode"],
        "publishDescriptionPrefix": pub["publish_description_prefix"],
        "publishDescriptionSuffix": pub["publish_description_suffix"],
        "publishHybridIncludeAi": pub["publish_hybrid_include_ai"],
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

    if p.get("clear_search_secrets"):
        for k in p["clear_search_secrets"] or []:
            if k in _SEARCH_SECRET_JSON_KEYS:
                cur.pop(str(k), None)

    if "search_provider_main" in p:
        tok = _validate_search_provider_token(
            p.get("search_provider_main"), label="search_provider_main"
        )
        if tok is not None:
            if tok == "":
                cur.pop("search_provider_main", None)
            else:
                cur["search_provider_main"] = tok

    if "search_provider_fallback" in p:
        tok = _validate_search_provider_token(
            p.get("search_provider_fallback"), label="search_provider_fallback"
        )
        if tok is not None:
            if tok == "":
                cur.pop("search_provider_fallback", None)
            else:
                cur["search_provider_fallback"] = tok

    if "llm_provider" in p and p["llm_provider"] is not None:
        lp = str(p["llm_provider"]).lower().strip()
        if lp in ("openai", "anthropic"):
            cur["llm_provider"] = lp

    if "transcription_backend" in p and p["transcription_backend"] is not None:
        cur["transcription_backend"] = _normalize_transcription_backend(
            str(p["transcription_backend"])
        )

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
    merge_secret("brave_api_key", "brave_api_key")
    merge_secret("brave_search_api_key", "brave_search_api_key")
    merge_secret("exa_api_key", "exa_api_key")
    merge_secret("firecrawl_api_key", "firecrawl_api_key")
    merge_secret("gemini_api_key", "gemini_api_key")
    merge_secret("xai_api_key", "xai_api_key")
    merge_secret("moonshot_api_key", "moonshot_api_key")
    merge_secret("kimi_api_key", "kimi_api_key")
    merge_secret("minimax_code_plan_key", "minimax_code_plan_key")
    merge_secret("minimax_coding_api_key", "minimax_coding_api_key")
    merge_secret("minimax_api_key", "minimax_api_key")
    merge_secret("ollama_api_key", "ollama_api_key")
    merge_secret("perplexity_api_key", "perplexity_api_key")
    merge_secret("openrouter_api_key", "openrouter_api_key")
    merge_secret("searxng_base_url", "searxng_base_url")

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
    merge_optional_str("duckduckgo_backend", "duckduckgo_backend")
    merge_optional_str("brave_search_country", "brave_search_country")

    def merge_pipeline() -> None:
        for json_key in _PIPELINE_JSON_KEYS:
            if json_key not in p or p[json_key] is None:
                continue
            val = p[json_key]
            if json_key == "max_upload_bytes":
                cur[json_key] = int(val)
            else:
                cur[json_key] = float(val)

    merge_pipeline()

    if any(k in p and p[k] is not None for k in _PIPELINE_JSON_KEYS):
        _validate_pipeline_effective(pipeline_settings_effective(cur))

    def merge_publish() -> None:
        if "publish_title_source" in p and p["publish_title_source"] is not None:
            v = str(p["publish_title_source"]).strip().lower()
            if v in ("ai_clip", "run_filename"):
                cur["publish_title_source"] = v
        if "publish_description_mode" in p and p["publish_description_mode"] is not None:
            v = str(p["publish_description_mode"]).strip().lower()
            if v in ("full_ai", "manual", "hybrid"):
                cur["publish_description_mode"] = v
        if "publish_description_prefix" in p:
            v = p["publish_description_prefix"]
            if v is None:
                cur.pop("publish_description_prefix", None)
            else:
                cur["publish_description_prefix"] = str(v)
        if "publish_description_suffix" in p:
            v = p["publish_description_suffix"]
            if v is None:
                cur.pop("publish_description_suffix", None)
            else:
                cur["publish_description_suffix"] = str(v)
        if "publish_hybrid_include_ai" in p and p["publish_hybrid_include_ai"] is not None:
            cur["publish_hybrid_include_ai"] = bool(p["publish_hybrid_include_ai"])

    merge_publish()
    _validate_publish_settings(merge_publish_from_stored(cur))

    _save_dict(cur)
    return {"status": "ok"}
