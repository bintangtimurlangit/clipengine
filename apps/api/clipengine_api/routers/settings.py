"""Persisted engine settings (LLM provider, keys, optional Tavily)."""

from __future__ import annotations

import json
import os
from typing import Any, Literal

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from clipengine_api.core import db
from clipengine_api.core.env import (
    MAX_UPLOAD_BYTES_CAP,
    MIN_UPLOAD_BYTES,
    pipeline_settings_effective,
)
from clipengine_api.core.llm_profiles import (
    normalize_stored_llm_profiles,
    profile_by_id,
    profiles_for_public_api,
    sync_flat_llm_keys_into_primary_profile,
    validate_llm_profiles_payload,
)
from clipengine_api.core.llm_status import is_llm_configured
from clipengine_api.services.docker_worker import (
    docker_workers_env_overridden,
    use_docker_workers,
)
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
    if x == "assemblyai":
        return "assemblyai"
    return "local"


class LlmSettingsPatch(BaseModel):
    llm_profiles: list[dict[str, Any]] | None = None
    llm_primary_id: str | None = None
    llm_fallback_ids: list[str] | None = None
    clear_llm_profile_keys: list[str] | None = None
    llm_provider: str | None = Field(
        default=None,
        description="'openai' or 'anthropic'",
    )
    transcription_backend: str | None = Field(
        default=None,
        description="'local' (faster-whisper), 'openai_api' (OpenAI /v1/audio/transcriptions), or 'assemblyai'",
    )
    assemblyai_api_key: str | None = None
    assemblyai_base_url: str | None = None
    openai_api_key: str | None = None
    openai_base_url: str | None = None
    openai_model: str | None = None
    anthropic_api_key: str | None = None
    anthropic_base_url: str | None = None
    anthropic_model: str | None = None
    tavily_api_key: str | None = None
    search_provider_main: str | None = None
    search_provider_fallback: str | None = None
    duckduckgo_region: str | None = None
    duckduckgo_safe_search: str | None = None
    duckduckgo_text_backend: str | None = None
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
    clear_assemblyai_api_key: bool = False
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
    use_docker_workers: bool | None = Field(
        default=None,
        description="Run ingest/plan/render in ephemeral Docker worker containers (requires Docker socket + worker image on the host).",
    )


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


def _st(v: Any) -> str:
    if v is None:
        return ""
    return str(v).strip()


def _normalize_openai_v1_base(raw: str | None) -> str:
    """Ensure an OpenAI-compatible root ending in ``/v1`` (default: api.openai.com)."""
    s = _st(raw)
    if not s:
        return "https://api.openai.com/v1"
    s = s.rstrip("/")
    if s.endswith("/v1"):
        return s
    if "/v1" in s:
        # e.g. .../openai/v1 — treat as already rooted at a v1 segment
        return s
    return f"{s}/v1"


def _anthropic_models_url(base_raw: str | None) -> str:
    root = _st(base_raw)
    if not root:
        root = "https://api.anthropic.com"
    root = root.rstrip("/")
    return f"{root}/v1/models"


def _parse_openai_style_models_payload(data: Any) -> list[str]:
    """Parse ``/v1/models`` JSON (OpenAI, OpenRouter, Groq, Together, Ollama /v1, …)."""
    if not isinstance(data, dict):
        return []
    out: list[str] = []
    rows = data.get("data")
    if isinstance(rows, list):
        for item in rows:
            if isinstance(item, dict) and item.get("id"):
                out.append(str(item["id"]))
    return sorted(set(out), key=str.lower)


class LlmListModelsRequest(BaseModel):
    provider: Literal["openai", "anthropic"]
    profile_id: str | None = Field(
        default=None,
        description="Profile id to read the stored API key from (optional if api_key is sent).",
    )
    base_url: str | None = Field(
        default=None,
        description="Override base URL from the form (optional).",
    )
    api_key: str | None = Field(
        default=None,
        description="One-shot key from the form (before save). Leave empty to use the stored key.",
    )


def _resolve_key_for_llm_list(
    *,
    stored: dict[str, Any],
    provider: Literal["openai", "anthropic"],
    profile_id: str | None,
    api_key_override: str | None,
) -> str:
    o = _st(api_key_override)
    if o:
        return o
    pid = _st(profile_id)
    if not pid:
        raise HTTPException(
            status_code=400,
            detail="Provide profile_id (saved key) or api_key to list models",
        )
    norm = normalize_stored_llm_profiles(stored)
    prof = profile_by_id(norm, pid)
    if not prof:
        if provider == "openai":
            k = _st(os.environ.get("OPENAI_API_KEY"))
        else:
            k = _st(os.environ.get("ANTHROPIC_API_KEY"))
        if k:
            return k
        raise HTTPException(
            status_code=400,
            detail="Unknown profile_id — save settings once, paste an API key, or set OPENAI_API_KEY / ANTHROPIC_API_KEY on the server",
        )
    pprov = str(prof.get("provider") or "").lower()
    if pprov != provider:
        raise HTTPException(status_code=400, detail="Profile provider does not match request")
    k = _st(prof.get("api_key"))
    if not k:
        if provider == "openai":
            k = _st(os.environ.get("OPENAI_API_KEY"))
        else:
            k = _st(os.environ.get("ANTHROPIC_API_KEY"))
    if not k:
        raise HTTPException(
            status_code=400,
            detail="No API key for this profile; enter a key or save settings first",
        )
    return k


def _resolve_base_for_llm_list(
    *,
    body_base: str | None,
    stored: dict[str, Any],
    profile_id: str | None,
    provider: Literal["openai", "anthropic"],
) -> str:
    b = _st(body_base)
    if b:
        return b
    pid = _st(profile_id)
    if pid:
        norm = normalize_stored_llm_profiles(stored)
        prof = profile_by_id(norm, pid)
        if prof:
            bu = _st(prof.get("base_url"))
            if bu:
                return bu
    if provider == "openai":
        return _st(os.environ.get("OPENAI_BASE_URL"))
    return _st(os.environ.get("ANTHROPIC_BASE_URL"))


@router.post("/settings/llm-list-models")
def post_llm_list_models(body: LlmListModelsRequest) -> dict[str, Any]:
    """
    List models from an OpenAI-compatible ``GET /v1/models`` or Anthropic ``GET /v1/models``.

    Called from the settings UI so keys and URLs stay server-side (avoids browser CORS to providers).
    """
    complete, _ = db.get_setup_state()
    if not complete:
        raise HTTPException(status_code=403, detail="Complete setup first")
    stored = _load_dict()
    key = _resolve_key_for_llm_list(
        stored=stored,
        provider=body.provider,
        profile_id=body.profile_id,
        api_key_override=body.api_key,
    )
    base = _resolve_base_for_llm_list(
        body_base=body.base_url,
        stored=stored,
        profile_id=body.profile_id,
        provider=body.provider,
    )
    timeout = httpx.Timeout(60.0, connect=30.0)
    try:
        with httpx.Client(timeout=timeout) as client:
            if body.provider == "openai":
                root = _normalize_openai_v1_base(base or None)
                url = f"{root}/models"
                r = client.get(
                    url,
                    headers={"Authorization": f"Bearer {key}"},
                )
            else:
                url = _anthropic_models_url(base or None)
                r = client.get(
                    url,
                    headers={
                        "x-api-key": key,
                        "anthropic-version": "2023-06-01",
                    },
                )
            r.raise_for_status()
            payload = r.json()
    except httpx.HTTPStatusError as e:
        detail = f"Provider returned HTTP {e.response.status_code}"
        try:
            txt = e.response.text
            if txt and len(txt) < 500:
                detail = f"{detail}: {txt}"
        except OSError:
            pass
        raise HTTPException(status_code=502, detail=detail) from e
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Request failed: {e}") from e
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=502, detail="Provider returned non-JSON for models list"
        ) from e

    models = _parse_openai_style_models_payload(payload)
    if body.provider == "anthropic" and not models and isinstance(payload, dict):
        alt = payload.get("models")
        extra: list[str] = []
        if isinstance(alt, list):
            for item in alt:
                if isinstance(item, dict) and item.get("id"):
                    extra.append(str(item["id"]))
                elif isinstance(item, str):
                    extra.append(item)
        if extra:
            models = sorted(set(extra), key=str.lower)
    if not models:
        raise HTTPException(
            status_code=502,
            detail="Could not parse any model ids from the provider response",
        )
    return {"models": models}


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
    norm = normalize_stored_llm_profiles(stored)
    primary = profile_by_id(norm, str(norm.get("llm_primary_id") or ""))
    lp = (primary or {}).get("provider") or stored.get("llm_provider")
    lp = lp or os.environ.get("LLM_PROVIDER") or "openai"
    if str(lp).lower() in ("anthropic", "claude"):
        lp = "anthropic"
    else:
        lp = "openai"

    def _first_prof(prov: str) -> dict[str, Any]:
        for x in norm.get("llm_profiles") or []:
            if isinstance(x, dict) and x.get("provider") == prov:
                return x
        return {}

    oa = _first_prof("openai")
    an = _first_prof("anthropic")
    tb_src = stored.get("transcription_backend") or os.environ.get(
        "CLIPENGINE_TRANSCRIPTION_BACKEND"
    )
    tb = _normalize_transcription_backend(str(tb_src) if tb_src else None)
    pub = merge_publish_from_stored(stored)
    return {
        "llmProfiles": profiles_for_public_api(stored),
        "llmPrimaryId": str(norm.get("llm_primary_id") or ""),
        "llmFallbackIds": list(norm.get("llm_fallback_ids") or []),
        "llmProvider": lp,
        "transcriptionBackend": tb,
        "openaiBaseUrl": (oa.get("base_url") or stored.get("openai_base_url"))
        or os.environ.get("OPENAI_BASE_URL")
        or "",
        "openaiModel": (oa.get("model") or stored.get("openai_model"))
        or os.environ.get("OPENAI_MODEL")
        or "gpt-4o-mini",
        "openaiKeyConfigured": bool(str(oa.get("api_key") or "").strip())
        or _key_configured(stored, "OPENAI_API_KEY", "openai_api_key"),
        "anthropicBaseUrl": (an.get("base_url") or stored.get("anthropic_base_url"))
        or os.environ.get("ANTHROPIC_BASE_URL")
        or "",
        "anthropicModel": (an.get("model") or stored.get("anthropic_model"))
        or os.environ.get("ANTHROPIC_MODEL")
        or "claude-3-5-sonnet-20241022",
        "anthropicKeyConfigured": bool(str(an.get("api_key") or "").strip())
        or _key_configured(stored, "ANTHROPIC_API_KEY", "anthropic_api_key"),
        "assemblyaiKeyConfigured": _key_configured(
            stored, "ASSEMBLYAI_API_KEY", "assemblyai_api_key"
        ),
        "assemblyaiBaseUrl": stored.get("assemblyai_base_url")
        or os.environ.get("ASSEMBLYAI_BASE_URL")
        or "",
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
        "duckduckgoRegion": stored.get("duckduckgo_region")
        or os.environ.get("DUCKDUCKGO_REGION")
        or "us-en",
        "duckduckgoSafeSearch": stored.get("duckduckgo_safe_search")
        or os.environ.get("DUCKDUCKGO_SAFE_SEARCH")
        or "moderate",
        "duckduckgoTextBackend": stored.get("duckduckgo_text_backend")
        or os.environ.get("DUCKDUCKGO_TEXT_BACKEND")
        or "auto",
        "braveSearchCountry": stored.get("brave_search_country")
        or os.environ.get("BRAVE_SEARCH_COUNTRY")
        or os.environ.get("BRAVE_COUNTRY")
        or "",
        "workspacePath": os.environ.get("CLIPENGINE_WORKSPACE", "/workspace"),
        "dataPath": os.environ.get("CLIPENGINE_DATA_DIR", "/data"),
        "useDockerWorkers": bool(stored.get("use_docker_workers") is True),
        "useDockerWorkersEffective": use_docker_workers(),
        "dockerWorkersOverriddenByEnv": docker_workers_env_overridden(),
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
        plist = cur.get("llm_profiles")
        if isinstance(plist, list):
            norm = normalize_stored_llm_profiles(cur)
            pid = str(norm.get("llm_primary_id") or "")
            for prof in plist:
                if (
                    isinstance(prof, dict)
                    and str(prof.get("id")) == pid
                    and prof.get("provider") == "openai"
                ):
                    prof.pop("api_key", None)
                    break
    if p.get("clear_anthropic_api_key"):
        cur.pop("anthropic_api_key", None)
        plist = cur.get("llm_profiles")
        if isinstance(plist, list):
            norm = normalize_stored_llm_profiles(cur)
            pid = str(norm.get("llm_primary_id") or "")
            for prof in plist:
                if (
                    isinstance(prof, dict)
                    and str(prof.get("id")) == pid
                    and prof.get("provider") == "anthropic"
                ):
                    prof.pop("api_key", None)
                    break
    if p.get("clear_assemblyai_api_key"):
        cur.pop("assemblyai_api_key", None)
    if p.get("clear_tavily_api_key"):
        cur.pop("tavily_api_key", None)

    if p.get("clear_search_secrets"):
        for k in p["clear_search_secrets"] or []:
            if k in _SEARCH_SECRET_JSON_KEYS:
                cur.pop(str(k), None)

    if p.get("clear_llm_profile_keys"):
        for pid in p["clear_llm_profile_keys"] or []:
            sp = str(pid).strip()
            if not sp:
                continue
            plist = cur.get("llm_profiles")
            if not isinstance(plist, list):
                continue
            for prof in plist:
                if isinstance(prof, dict) and str(prof.get("id")) == sp:
                    prof.pop("api_key", None)

    def _pick(d: dict[str, Any], *keys: str) -> Any:
        for k in keys:
            if k in d and d[k] is not None:
                return d[k]
        return None

    if "llm_profiles" in p and p["llm_profiles"] is not None:
        incoming = p["llm_profiles"]
        if not isinstance(incoming, list):
            raise HTTPException(status_code=400, detail="llm_profiles must be a list")
        cur_norm = normalize_stored_llm_profiles(cur)
        cur_by_id = {
            str(x["id"]): dict(x)
            for x in (cur_norm.get("llm_profiles") or [])
            if isinstance(x, dict) and x.get("id")
        }
        merged: list[dict[str, Any]] = []
        for ip in incoming:
            if not isinstance(ip, dict):
                continue
            pid = str(_pick(ip, "id") or "").strip()
            if not pid:
                raise HTTPException(status_code=400, detail="each llm profile must include id")
            old = cur_by_id.get(pid, {})
            prov_raw = str(_pick(ip, "provider") or old.get("provider") or "").lower().strip()
            if prov_raw in ("anthropic", "claude"):
                prov = "anthropic"
            elif prov_raw in ("openai", "openai_compat", "openai-compatible", "oai"):
                prov = "openai"
            else:
                raise HTTPException(
                    status_code=400,
                    detail="each llm profile must have provider openai or anthropic",
                )
            label_v = _pick(ip, "label")
            if label_v is None:
                label_v = old.get("label")
            label_out = str(label_v).strip() if label_v is not None else None
            bu_v = _pick(ip, "base_url", "baseUrl")
            if bu_v is None:
                bu_v = old.get("base_url")
            mo_v = _pick(ip, "model")
            if mo_v is None:
                mo_v = old.get("model")
            np: dict[str, Any] = {
                "id": pid,
                "label": label_out or None,
                "provider": prov,
                "base_url": str(bu_v).strip() if bu_v is not None and str(bu_v).strip() else None,
                "model": str(mo_v).strip() if mo_v is not None and str(mo_v).strip() else None,
            }
            ak_in = _pick(ip, "api_key", "apiKey")
            if ak_in is not None and str(ak_in).strip():
                np["api_key"] = str(ak_in).strip()
            elif old.get("api_key"):
                np["api_key"] = old["api_key"]
            merged.append(np)
        if not merged:
            raise HTTPException(status_code=400, detail="llm_profiles must not be empty")
        cur["llm_profiles"] = merged

    if "llm_primary_id" in p and p["llm_primary_id"] is not None:
        cur["llm_primary_id"] = str(p["llm_primary_id"]).strip()

    if "llm_fallback_ids" in p and p["llm_fallback_ids"] is not None:
        cur["llm_fallback_ids"] = []
        for x in p["llm_fallback_ids"] or []:
            s = str(x).strip()
            if s:
                cur["llm_fallback_ids"].append(s)

    if "llm_provider" in p and p["llm_provider"] is not None:
        lp = str(p["llm_provider"]).lower().strip()
        if lp in ("openai", "anthropic"):
            cur["llm_provider"] = lp
            if ("llm_profiles" not in p or p["llm_profiles"] is None) and (
                "llm_primary_id" not in p or p["llm_primary_id"] is None
            ):
                norm = normalize_stored_llm_profiles(cur)
                for prof in norm.get("llm_profiles") or []:
                    if isinstance(prof, dict) and prof.get("provider") == lp:
                        cur["llm_primary_id"] = str(prof["id"])
                        break

    if any(
        k in p and p.get(k) is not None
        for k in (
            "llm_profiles",
            "llm_primary_id",
            "llm_fallback_ids",
            "llm_provider",
        )
    ):
        try:
            cur_norm = normalize_stored_llm_profiles(cur)
            validate_llm_profiles_payload(
                list(cur_norm.get("llm_profiles") or []),
                str(cur_norm.get("llm_primary_id") or ""),
                list(cur_norm.get("llm_fallback_ids") or []),
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

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

    if "transcription_backend" in p and p["transcription_backend"] is not None:
        cur["transcription_backend"] = _normalize_transcription_backend(
            str(p["transcription_backend"])
        )

    if "use_docker_workers" in p and p["use_docker_workers"] is not None:
        cur["use_docker_workers"] = bool(p["use_docker_workers"])

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
    merge_secret("assemblyai_api_key", "assemblyai_api_key")
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
    merge_optional_str("assemblyai_base_url", "assemblyai_base_url")
    merge_optional_str("duckduckgo_region", "duckduckgo_region")
    merge_optional_str("duckduckgo_safe_search", "duckduckgo_safe_search")
    merge_optional_str("duckduckgo_text_backend", "duckduckgo_text_backend")
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

    sync_flat_llm_keys_into_primary_profile(cur)

    _save_dict(cur)
    return {"status": "ok"}
