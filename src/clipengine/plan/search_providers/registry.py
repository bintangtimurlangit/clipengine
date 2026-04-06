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
        return _nonempty_env("BRAVE_API_KEY")
    if p == "duckduckgo":
        return normalize_provider_id(os.environ.get("SEARCH_PROVIDER")) == "duckduckgo"
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


def resolve_provider_id() -> str:
    """Effective provider id (never ``auto``). ``none`` means web search is off."""
    explicit = normalize_provider_id(os.environ.get("SEARCH_PROVIDER"))
    if explicit == "none":
        return "none"
    if explicit and explicit not in ("auto", ""):
        return explicit
    for p in _AUTO_TRY_ORDER:
        if provider_is_configured(p):
            return p
    if provider_is_configured("duckduckgo"):
        return "duckduckgo"
    return "none"


def active_provider_label() -> str:
    pid = resolve_provider_id()
    return "off" if pid == "none" else pid


def web_search_configured() -> bool:
    """True when a provider is selected and credentials match."""
    pid = resolve_provider_id()
    if pid == "none":
        return False
    return provider_is_configured(pid)


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


def web_search(query: str, *, max_results: int = 5) -> str:
    """Run the configured provider and return plain text for the LLM."""
    pid = resolve_provider_id()
    if pid == "none":
        raise ValueError(
            "Web search is disabled (no SEARCH_PROVIDER / API keys). "
            "Set TAVILY_API_KEY or another provider env var, or SEARCH_PROVIDER=duckduckgo."
        )
    fn = _DISPATCH.get(pid)
    if fn is None:
        raise ValueError(f"Unknown SEARCH_PROVIDER: {pid!r}")
    if not provider_is_configured(pid):
        raise ValueError(
            f"Search provider {pid!r} is not configured (missing API key or SEARXNG_BASE_URL). "
            "Set the matching environment variables or pick another SEARCH_PROVIDER."
        )
    return fn(query, max_results=max_results)
