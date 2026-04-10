"""Provider selection, env checks, and dispatch to per-provider modules."""

from __future__ import annotations

import os
from typing import Callable

from . import (
    brave,
    duckduckgo,
    exa,
    firecrawl,
    gemini,
    grok,
    kimi,
    minimax,
    ollama_web,
    perplexity,
    searxng,
    tavily,
)

ProviderFn = Callable[..., str]

_ALIASES: dict[str, str] = {
    "ddg": "duckduckgo",
    "duckduckgo": "duckduckgo",
    "ollama": "ollama_web",
    "ollama_web": "ollama_web",
    "tavily": "tavily",
    "brave": "brave",
    "exa": "exa",
    "firecrawl": "firecrawl",
    "gemini": "gemini",
    "grok": "grok",
    "xai": "grok",
    "kimi": "kimi",
    "moonshot": "kimi",
    "minimax": "minimax",
    "perplexity": "perplexity",
    "searxng": "searxng",
    "auto": "auto",
}


def normalize_provider_id(raw: str | None) -> str:
    s = (raw or "").strip().lower()
    if not s:
        return "auto"
    if s in ("none", "off", "disabled"):
        return "none"
    return _ALIASES.get(s, s)


def _nonempty_env(*names: str) -> bool:
    for n in names:
        v = os.environ.get(n)
        if v and str(v).strip():
            return True
    return False


def _explicit_main_raw() -> str | None:
    """Prefer ``SEARCH_PROVIDER_MAIN``, then legacy ``SEARCH_PROVIDER``."""
    for key in ("SEARCH_PROVIDER_MAIN", "SEARCH_PROVIDER"):
        v = os.environ.get(key)
        if v is not None and str(v).strip():
            return str(v).strip()
    return None


def provider_is_configured(provider_id: str) -> bool:
    """Return True if credentials (or keyless config) exist for this provider."""
    p = normalize_provider_id(provider_id)
    if p == "none":
        return False
    if p == "auto":
        return any(provider_is_configured(x) for x in _AUTO_TRY_ORDER) or provider_is_configured(
            "duckduckgo"
        )
    if p == "tavily":
        return _nonempty_env("TAVILY_API_KEY")
    if p == "brave":
        return _nonempty_env("BRAVE_API_KEY", "BRAVE_SEARCH_API_KEY")
    if p == "duckduckgo":
        return True
    if p == "exa":
        return _nonempty_env("EXA_API_KEY")
    if p == "firecrawl":
        return _nonempty_env("FIRECRAWL_API_KEY")
    if p == "gemini":
        return _nonempty_env("GEMINI_API_KEY")
    if p == "grok":
        return _nonempty_env("XAI_API_KEY")
    if p == "kimi":
        return _nonempty_env("KIMI_API_KEY", "MOONSHOT_API_KEY")
    if p == "minimax":
        return _nonempty_env(
            "MINIMAX_CODE_PLAN_KEY", "MINIMAX_CODING_API_KEY", "MINIMAX_API_KEY"
        )
    if p == "ollama_web":
        return _nonempty_env("OLLAMA_API_KEY")
    if p == "perplexity":
        return _nonempty_env("PERPLEXITY_API_KEY", "OPENROUTER_API_KEY")
    if p == "searxng":
        return _nonempty_env("SEARXNG_BASE_URL")
    return False


_AUTO_TRY_ORDER: tuple[str, ...] = (
    "tavily",
    "brave",
    "exa",
    "firecrawl",
    "gemini",
    "grok",
    "kimi",
    "minimax",
    "ollama_web",
    "perplexity",
    "searxng",
    "duckduckgo",
)


def resolve_primary_provider_id() -> str:
    """Effective primary provider id (never ``auto`` in output). ``none`` means off for primary."""
    raw = _explicit_main_raw()
    explicit = normalize_provider_id(raw) if raw is not None else "auto"
    if explicit == "none":
        return "none"
    if explicit not in ("auto", ""):
        return explicit
    for p in _AUTO_TRY_ORDER:
        if provider_is_configured(p):
            return p
    if provider_is_configured("duckduckgo"):
        return "duckduckgo"
    return "none"


def resolve_fallback_provider_id() -> str:
    """Secondary provider when primary returns empty or errors. ``none`` if unset or invalid."""
    v = os.environ.get("SEARCH_PROVIDER_FALLBACK")
    if not v or not str(v).strip():
        return "none"
    fb = normalize_provider_id(str(v).strip())
    if fb in ("none", "auto", ""):
        return "none"
    return fb


def resolve_provider_id() -> str:
    """Same as :func:`resolve_primary_provider_id` (backward compatible name)."""
    return resolve_primary_provider_id()


def active_search_stack_label() -> str:
    """Human-readable primary and optional fallback (e.g. ``tavily→duckduckgo``)."""
    p = resolve_primary_provider_id()
    f = resolve_fallback_provider_id()
    if p == "none" and f == "none":
        return "off"
    if p == "none":
        return f if f != "none" else "off"
    if f == "none" or f == p:
        return p
    return f"{p}→{f}"


def active_provider_label() -> str:
    """Short label for logging; includes fallback when configured."""
    return active_search_stack_label()


def web_search_configured() -> bool:
    """True when primary or fallback can run (configured providers only)."""
    p = resolve_primary_provider_id()
    f = resolve_fallback_provider_id()
    if p != "none" and provider_is_configured(p):
        return True
    if f != "none" and provider_is_configured(f):
        return True
    return False


def _tavily_run(query: str, *, max_results: int) -> str:
    return tavily.search(query, max_results=max_results, search_depth="basic")


_DISPATCH: dict[str, ProviderFn] = {
    "tavily": _tavily_run,
    "brave": brave.search,
    "duckduckgo": duckduckgo.search,
    "exa": exa.search,
    "firecrawl": firecrawl.search,
    "gemini": gemini.search,
    "grok": grok.search,
    "kimi": kimi.search,
    "minimax": minimax.search,
    "ollama_web": ollama_web.search,
    "perplexity": perplexity.search,
    "searxng": searxng.search,
}


def _provider_chain() -> list[str]:
    primary = resolve_primary_provider_id()
    fallback = resolve_fallback_provider_id()
    out: list[str] = []
    if primary != "none":
        out.append(primary)
    if fallback != "none" and fallback not in out:
        out.append(fallback)
    return out


def web_search(query: str, *, max_results: int = 5) -> str:
    """Run the configured primary provider, then fallback if needed, and return plain text."""
    chain = _provider_chain()
    if not chain:
        raise ValueError(
            "Web search is disabled (SEARCH_PROVIDER_MAIN / SEARCH_PROVIDER / fallback unset "
            "or none). Set keys in Settings or environment, or SEARCH_PROVIDER=duckduckgo."
        )
    last_err: Exception | None = None
    tried_configured = False
    for pid in chain:
        if not provider_is_configured(pid):
            continue
        tried_configured = True
        fn = _DISPATCH.get(pid)
        if fn is None:
            last_err = ValueError(f"Unknown search provider: {pid!r}")
            continue
        try:
            text = fn(query, max_results=max_results)
        except Exception as e:
            last_err = e
            continue
        if text and str(text).strip():
            return text
    if not tried_configured:
        raise ValueError(
            f"Search providers {chain!r} are not configured (missing API keys or URLs). "
            "Add credentials in Settings or environment."
        )
    if last_err is not None:
        raise last_err
    raise ValueError(
        f"Web search returned no text for {chain!r}. "
        "Check API keys or try another SEARCH_PROVIDER_FALLBACK."
    )
