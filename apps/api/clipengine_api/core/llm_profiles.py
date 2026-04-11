"""Normalize multi-profile LLM settings (SQLite JSON) and build runtime chain payloads."""

from __future__ import annotations

import copy
import json
import os
import uuid
from typing import Any, Literal

from clipengine.plan.llm_constants import LLM_PROFILE_CHAIN_ENV

LlmProviderId = Literal["openai", "anthropic"]


def _strip(v: Any) -> str:
    if v is None:
        return ""
    return str(v).strip()


def _legacy_openai_signal(stored: dict[str, Any]) -> bool:
    return bool(_strip(stored.get("openai_api_key"))) or bool(
        _strip(stored.get("openai_base_url"))
    ) or bool(_strip(stored.get("openai_model")))


def _legacy_anthropic_signal(stored: dict[str, Any]) -> bool:
    return bool(_strip(stored.get("anthropic_api_key"))) or bool(
        _strip(stored.get("anthropic_base_url"))
    ) or bool(_strip(stored.get("anthropic_model")))


def _migrate_from_legacy(stored: dict[str, Any]) -> dict[str, Any]:
    """If ``llm_profiles`` is missing, synthesize from flat keys."""
    out = copy.deepcopy(stored)
    if isinstance(out.get("llm_profiles"), list) and len(out["llm_profiles"]) > 0:
        return out

    profiles: list[dict[str, Any]] = []
    if _legacy_openai_signal(stored) or not _legacy_anthropic_signal(stored):
        profiles.append(
            {
                "id": str(uuid.uuid4()),
                "label": "OpenAI",
                "provider": "openai",
                "api_key": _strip(stored.get("openai_api_key")) or None,
                "base_url": _strip(stored.get("openai_base_url")) or None,
                "model": _strip(stored.get("openai_model")) or None,
            }
        )
    if _legacy_anthropic_signal(stored):
        profiles.append(
            {
                "id": str(uuid.uuid4()),
                "label": "Anthropic",
                "provider": "anthropic",
                "api_key": _strip(stored.get("anthropic_api_key")) or None,
                "base_url": _strip(stored.get("anthropic_base_url")) or None,
                "model": _strip(stored.get("anthropic_model")) or None,
            }
        )

    if not profiles:
        profiles.append(
            {
                "id": str(uuid.uuid4()),
                "label": "OpenAI",
                "provider": "openai",
                "api_key": None,
                "base_url": None,
                "model": None,
            }
        )

    lp = _strip(stored.get("llm_provider")) or os.environ.get("LLM_PROVIDER") or "openai"
    lp_l = lp.lower()
    want = "anthropic" if lp_l in ("anthropic", "claude") else "openai"
    primary_id: str | None = None
    for p in profiles:
        if p.get("provider") == want:
            primary_id = str(p["id"])
            break
    if primary_id is None:
        primary_id = str(profiles[0]["id"])

    out["llm_profiles"] = profiles
    out["llm_primary_id"] = primary_id
    out["llm_fallback_ids"] = []
    return out


def _normalize_provider(raw: Any) -> LlmProviderId | None:
    if raw is None:
        return None
    s = str(raw).lower().strip()
    if s in ("anthropic", "claude"):
        return "anthropic"
    if s in ("openai", "openai_compat", "openai-compatible", "oai"):
        return "openai"
    return None


def derive_llm_profile_label(
    provider: LlmProviderId,
    base_url: str | None,
    model: str | None,
) -> str:
    """
    Short display name from provider, optional base URL (known aggregators), and model id.
    Used when the client omits ``label``.
    """
    bu = _strip(base_url).lower().rstrip("/")
    m = _strip(model)
    tail = f" · {m}" if m else ""
    if provider == "anthropic":
        if "minimax" in bu:
            return f"MiniMax{tail}" if tail else "MiniMax"
        return f"Anthropic{tail}" if tail else "Anthropic"
    patterns: list[tuple[str, str]] = [
        ("openrouter.ai", "OpenRouter"),
        ("api.groq.com", "Groq"),
        ("together.xyz", "Together"),
        ("deepseek.com", "DeepSeek"),
        ("mistral.ai", "Mistral"),
        ("x.ai", "xAI"),
        ("fireworks.ai", "Fireworks"),
        ("perplexity.ai", "Perplexity"),
        ("127.0.0.1:11434", "Ollama"),
        ("localhost:11434", "Ollama"),
        ("127.0.0.1:1234", "LM Studio"),
        ("localhost:1234", "LM Studio"),
        ("api.openai.com", "OpenAI"),
    ]
    for needle, name in patterns:
        if needle in bu:
            return f"{name}{tail}" if tail else name
    return f"OpenAI{tail}" if tail else "OpenAI"


def _ensure_unique_profile_labels(profiles: list[dict[str, Any]]) -> None:
    """If two profiles share the same label, append the first 8 chars of id to duplicates."""
    counts: dict[str, int] = {}
    for p in profiles:
        lbl = str(p.get("label") or "")
        pid = str(p.get("id") or "")
        if not lbl:
            continue
        n = counts.get(lbl, 0)
        counts[lbl] = n + 1
        if n > 0 and pid:
            p["label"] = f"{lbl} · {pid[:8]}"


def _sanitize_profile(p: Any) -> dict[str, Any] | None:
    if not isinstance(p, dict):
        return None
    pid = _strip(p.get("id"))
    if not pid:
        pid = str(uuid.uuid4())
    prov = _normalize_provider(p.get("provider"))
    if prov is None:
        return None
    lbl = _strip(p.get("label")) or None
    if not lbl:
        lbl = derive_llm_profile_label(
            prov,
            _strip(p.get("base_url")) or None,
            _strip(p.get("model")) or None,
        )
    return {
        "id": pid,
        "label": lbl,
        "provider": prov,
        "api_key": _strip(p.get("api_key")) or None,
        "base_url": _strip(p.get("base_url")) or None,
        "model": _strip(p.get("model")) or None,
    }


def normalize_stored_llm_profiles(stored: dict[str, Any]) -> dict[str, Any]:
    """
    Return a copy of ``stored`` with ``llm_profiles``, ``llm_primary_id``, and
    ``llm_fallback_ids`` guaranteed (migrating from legacy flat keys when needed).
    Does not persist.
    """
    base = _migrate_from_legacy(stored)
    raw_list = base.get("llm_profiles")
    if not isinstance(raw_list, list):
        base = _migrate_from_legacy({**stored, "llm_profiles": []})

    profiles_in: list[Any] = base.get("llm_profiles") or []
    profiles: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for item in profiles_in:
        sp = _sanitize_profile(item)
        if sp is None:
            continue
        if sp["id"] in seen_ids:
            sp = {**sp, "id": str(uuid.uuid4())}
        seen_ids.add(str(sp["id"]))
        profiles.append(sp)

    _ensure_unique_profile_labels(profiles)

    if not profiles:
        profiles = [
            {
                "id": str(uuid.uuid4()),
                "label": derive_llm_profile_label("openai", None, None),
                "provider": "openai",
                "api_key": None,
                "base_url": None,
                "model": None,
            }
        ]

    primary_id = _strip(base.get("llm_primary_id"))
    if not primary_id or primary_id not in seen_ids:
        pid = str(profiles[0]["id"])
        primary_id = pid

    raw_fb = base.get("llm_fallback_ids")
    fallback_ids: list[str] = []
    if isinstance(raw_fb, list):
        for x in raw_fb:
            sid = _strip(x)
            if sid and sid in seen_ids and sid != primary_id and sid not in fallback_ids:
                fallback_ids.append(sid)

    out = copy.deepcopy(base)
    out["llm_profiles"] = profiles
    out["llm_primary_id"] = primary_id
    out["llm_fallback_ids"] = fallback_ids

    # Keep legacy flat keys in sync for primary (helps older clients / env-only tools)
    by_id = {str(p["id"]): p for p in profiles}
    primary = by_id.get(primary_id)
    if primary:
        out["llm_provider"] = primary["provider"]
        if primary["provider"] == "openai":
            if primary.get("api_key"):
                out["openai_api_key"] = primary["api_key"]
            if primary.get("base_url") is not None:
                out["openai_base_url"] = primary["base_url"] or ""
            if primary.get("model") is not None:
                out["openai_model"] = primary["model"] or ""
        else:
            if primary.get("api_key"):
                out["anthropic_api_key"] = primary["api_key"]
            if primary.get("base_url") is not None:
                out["anthropic_base_url"] = primary["base_url"] or ""
            if primary.get("model") is not None:
                out["anthropic_model"] = primary["model"] or ""

    return out


def profile_by_id(stored_norm: dict[str, Any], pid: str) -> dict[str, Any] | None:
    for p in stored_norm.get("llm_profiles") or []:
        if isinstance(p, dict) and str(p.get("id")) == pid:
            return p
    return None


def resolved_chain_entries(stored_norm: dict[str, Any]) -> list[dict[str, Any]]:
    """Ordered list of profile dicts for ``CLIPENGINE_LLM_PROFILE_CHAIN_JSON``."""
    profiles = stored_norm.get("llm_profiles") or []
    by_id = {str(p["id"]): p for p in profiles if isinstance(p, dict) and p.get("id")}
    primary_id = str(stored_norm.get("llm_primary_id") or "")
    out: list[dict[str, Any]] = []
    if primary_id in by_id:
        out.append(dict(by_id[primary_id]))
    for fid in stored_norm.get("llm_fallback_ids") or []:
        sid = str(fid).strip()
        if sid and sid in by_id and sid != primary_id:
            out.append(dict(by_id[sid]))
    return out


def chain_json_for_env(stored_norm: dict[str, Any]) -> str:
    """JSON array of profiles including secrets, for the worker process."""
    chain = resolved_chain_entries(stored_norm)
    serializable: list[dict[str, Any]] = []
    for p in chain:
        serializable.append(
            {
                "id": str(p.get("id")),
                "label": p.get("label"),
                "provider": p.get("provider"),
                "api_key": _strip(p.get("api_key")),
                "base_url": _strip(p.get("base_url")) or None,
                "model": _strip(p.get("model")) or None,
            }
        )
    return json.dumps(serializable, ensure_ascii=False)


def first_openai_with_key(chain: list[dict[str, Any]]) -> dict[str, Any] | None:
    for p in chain:
        if p.get("provider") != "openai":
            continue
        if _strip(p.get("api_key")):
            return p
    return None


def apply_llm_chain_to_environ(stored_norm: dict[str, Any]) -> None:
    """Set ``CLIPENGINE_LLM_PROFILE_CHAIN_JSON`` and legacy LLM env from primary profile."""
    chain = resolved_chain_entries(stored_norm)
    if chain:
        os.environ[LLM_PROFILE_CHAIN_ENV] = chain_json_for_env(stored_norm)
        primary = chain[0]
        prov = primary.get("provider")
        if prov == "openai":
            os.environ["LLM_PROVIDER"] = "openai"
            key = _strip(primary.get("api_key"))
            if key:
                os.environ["OPENAI_API_KEY"] = key
            bu = _strip(primary.get("base_url"))
            if bu:
                os.environ["OPENAI_BASE_URL"] = bu
            else:
                os.environ.pop("OPENAI_BASE_URL", None)
            mod = _strip(primary.get("model"))
            if mod:
                os.environ["OPENAI_MODEL"] = mod
            else:
                os.environ.pop("OPENAI_MODEL", None)
            os.environ.pop("ANTHROPIC_API_KEY", None)
            os.environ.pop("ANTHROPIC_BASE_URL", None)
            os.environ.pop("ANTHROPIC_MODEL", None)
        else:
            os.environ["LLM_PROVIDER"] = "anthropic"
            key = _strip(primary.get("api_key"))
            if key:
                os.environ["ANTHROPIC_API_KEY"] = key
            bu = _strip(primary.get("base_url"))
            if bu:
                os.environ["ANTHROPIC_BASE_URL"] = bu
            else:
                os.environ.pop("ANTHROPIC_BASE_URL", None)
            mod = _strip(primary.get("model"))
            if mod:
                os.environ["ANTHROPIC_MODEL"] = mod
            else:
                os.environ.pop("ANTHROPIC_MODEL", None)
            os.environ.pop("OPENAI_API_KEY", None)
            os.environ.pop("OPENAI_BASE_URL", None)
            os.environ.pop("OPENAI_MODEL", None)
    else:
        os.environ.pop(LLM_PROFILE_CHAIN_ENV, None)


def apply_openai_transcription_env_from_chain(stored_norm: dict[str, Any]) -> None:
    """If transcription uses OpenAI API, point OPENAI_* at first OpenAI profile with a key."""
    tb = (
        _strip(stored_norm.get("transcription_backend"))
        or os.environ.get("CLIPENGINE_TRANSCRIPTION_BACKEND")
        or "local"
    ).lower()
    if tb != "openai_api":
        return
    chain = resolved_chain_entries(stored_norm)
    oa = first_openai_with_key(chain)
    if oa is None:
        return
    os.environ["OPENAI_API_KEY"] = _strip(oa.get("api_key"))
    bu = _strip(oa.get("base_url"))
    if bu:
        os.environ["OPENAI_BASE_URL"] = bu


def sync_flat_llm_keys_into_primary_profile(cur: dict[str, Any]) -> None:
    """
    After legacy ``merge_secret`` / ``merge_optional_str`` updates flat keys, copy them into
    the primary profile so SQLite stays consistent when ``llm_profiles`` is present.
    Mutates ``cur`` in place.
    """
    plist = cur.get("llm_profiles")
    if not isinstance(plist, list) or not plist:
        return
    norm = normalize_stored_llm_profiles(cur)
    pid = str(norm.get("llm_primary_id") or "")
    for p in plist:
        if not isinstance(p, dict) or str(p.get("id")) != pid:
            continue
        prov = p.get("provider")
        if prov == "openai":
            v = cur.get("openai_api_key")
            if v is not None and str(v).strip():
                p["api_key"] = str(v).strip()
            if "openai_base_url" in cur:
                s = str(cur.get("openai_base_url") or "").strip()
                p["base_url"] = s or None
            if "openai_model" in cur:
                s = str(cur.get("openai_model") or "").strip()
                p["model"] = s or None
        elif prov == "anthropic":
            v = cur.get("anthropic_api_key")
            if v is not None and str(v).strip():
                p["api_key"] = str(v).strip()
            if "anthropic_base_url" in cur:
                s = str(cur.get("anthropic_base_url") or "").strip()
                p["base_url"] = s or None
            if "anthropic_model" in cur:
                s = str(cur.get("anthropic_model") or "").strip()
                p["model"] = s or None
        break


def profiles_for_public_api(stored: dict[str, Any]) -> list[dict[str, Any]]:
    """Profiles for GET /settings (no secrets)."""
    norm = normalize_stored_llm_profiles(stored)
    result: list[dict[str, Any]] = []
    for p in norm.get("llm_profiles") or []:
        if not isinstance(p, dict):
            continue
        pid = str(p.get("id") or "")
        if not pid:
            continue
        prov = _normalize_provider(p.get("provider"))
        if prov is None:
            continue
        result.append(
            {
                "id": pid,
                "label": p.get("label") or "",
                "provider": prov,
                "baseUrl": _strip(p.get("base_url")),
                "model": _strip(p.get("model")),
                "keyConfigured": bool(_strip(p.get("api_key"))),
            }
        )
    return result


def validate_llm_profiles_payload(
    profiles: list[dict[str, Any]],
    primary_id: str,
    fallback_ids: list[str],
) -> None:
    """Raise ValueError if the multi-profile payload is invalid."""
    if not profiles:
        raise ValueError("llm_profiles must contain at least one profile")
    seen: set[str] = set()
    by_id: dict[str, dict[str, Any]] = {}
    for p in profiles:
        if not isinstance(p, dict):
            raise ValueError("each llm profile must be an object")
        pid = _strip(p.get("id"))
        if not pid:
            raise ValueError("each llm profile must have an id")
        if pid in seen:
            raise ValueError("duplicate llm profile id")
        seen.add(pid)
        prov = _normalize_provider(p.get("provider"))
        if prov is None:
            raise ValueError("each llm profile must have provider openai or anthropic")
        by_id[pid] = p

    pid = str(primary_id).strip()
    if not pid or pid not in by_id:
        raise ValueError("llm_primary_id must match an llm profile id")

    prev: set[str] = set()
    for raw in fallback_ids:
        fid = str(raw).strip()
        if not fid:
            continue
        if fid not in by_id:
            raise ValueError(f"unknown fallback profile id: {fid}")
        if fid == pid:
            raise ValueError("fallback list must not include the primary profile")
        if fid in prev:
            raise ValueError("duplicate id in llm_fallback_ids")
        prev.add(fid)


def primary_api_key_configured(stored: dict[str, Any]) -> bool:
    """True if the primary profile has an API key (stored or process env for that provider)."""
    norm = normalize_stored_llm_profiles(stored)
    chain = resolved_chain_entries(norm)
    if not chain:
        return False
    p = chain[0]
    if _strip(p.get("api_key")):
        return True
    prov = p.get("provider")
    if prov == "openai":
        return bool(os.environ.get("OPENAI_API_KEY", "").strip())
    return bool(os.environ.get("ANTHROPIC_API_KEY", "").strip())
