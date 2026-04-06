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

router = APIRouter(tags=["settings"])


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
    clear_openai_api_key: bool = False
    clear_anthropic_api_key: bool = False
    clear_tavily_api_key: bool = False
    longform_min_s: float | None = None
    longform_max_s: float | None = None
    shortform_min_s: float | None = None
    shortform_max_s: float | None = None
    snap_duration_slack_s: float | None = None
    max_upload_bytes: int | None = None


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
        "workspacePath": os.environ.get("CLIPENGINE_WORKSPACE", "/workspace"),
        "dataPath": os.environ.get("CLIPENGINE_DATA_DIR", "/data"),
        **pipeline_settings_effective(stored),
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

    _save_dict(cur)
    return {"status": "ok"}
