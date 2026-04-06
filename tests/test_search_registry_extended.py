"""Extended tests for the search provider registry (no network)."""

from __future__ import annotations

import pytest


# ---------------------------------------------------------------------------
# provider_is_configured
# ---------------------------------------------------------------------------


def test_tavily_configured_with_key(monkeypatch) -> None:
    from clipengine.plan.search_providers.registry import provider_is_configured

    monkeypatch.setenv("TAVILY_API_KEY", "sk-test")
    assert provider_is_configured("tavily") is True


def test_tavily_not_configured_without_key(monkeypatch) -> None:
    from clipengine.plan.search_providers.registry import provider_is_configured

    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    assert provider_is_configured("tavily") is False


def test_brave_configured_with_key(monkeypatch) -> None:
    from clipengine.plan.search_providers.registry import provider_is_configured

    monkeypatch.setenv("BRAVE_API_KEY", "brave-key")
    assert provider_is_configured("brave") is True


def test_duckduckgo_configured_only_when_explicitly_selected(monkeypatch) -> None:
    from clipengine.plan.search_providers.registry import provider_is_configured

    monkeypatch.setenv("SEARCH_PROVIDER", "duckduckgo")
    assert provider_is_configured("duckduckgo") is True


def test_duckduckgo_not_configured_without_explicit_selection(monkeypatch) -> None:
    from clipengine.plan.search_providers.registry import provider_is_configured

    monkeypatch.delenv("SEARCH_PROVIDER", raising=False)
    assert provider_is_configured("duckduckgo") is False


def test_none_provider_is_never_configured() -> None:
    from clipengine.plan.search_providers.registry import provider_is_configured

    assert provider_is_configured("none") is False


def test_exa_configured_with_key(monkeypatch) -> None:
    from clipengine.plan.search_providers.registry import provider_is_configured

    monkeypatch.setenv("EXA_API_KEY", "exa-key")
    assert provider_is_configured("exa") is True


def test_searxng_configured_with_base_url(monkeypatch) -> None:
    from clipengine.plan.search_providers.registry import provider_is_configured

    monkeypatch.setenv("SEARXNG_BASE_URL", "http://localhost:8888")
    assert provider_is_configured("searxng") is True


def test_unknown_provider_returns_false() -> None:
    from clipengine.plan.search_providers.registry import provider_is_configured

    assert provider_is_configured("nonexistent_provider_xyz") is False


# ---------------------------------------------------------------------------
# resolve_provider_id
# ---------------------------------------------------------------------------


def test_resolve_provider_explicit_none(monkeypatch) -> None:
    from clipengine.plan.search_providers.registry import resolve_provider_id

    monkeypatch.setenv("SEARCH_PROVIDER", "none")
    assert resolve_provider_id() == "none"


_ALL_SEARCH_PROVIDER_KEYS = (
    "SEARCH_PROVIDER",
    "TAVILY_API_KEY",
    "BRAVE_API_KEY",
    "EXA_API_KEY",
    "FIRECRAWL_API_KEY",
    "GEMINI_API_KEY",
    "XAI_API_KEY",
    "KIMI_API_KEY",
    "MOONSHOT_API_KEY",
    "MINIMAX_CODE_PLAN_KEY",
    "MINIMAX_CODING_API_KEY",
    "MINIMAX_API_KEY",
    "OLLAMA_API_KEY",
    "PERPLEXITY_API_KEY",
    "OPENROUTER_API_KEY",
    "SEARXNG_BASE_URL",
)


def _clear_all_provider_keys(monkeypatch) -> None:
    """Remove every search-provider credential env var."""
    for key in _ALL_SEARCH_PROVIDER_KEYS:
        monkeypatch.delenv(key, raising=False)


def test_resolve_provider_explicit_tavily(monkeypatch) -> None:
    from clipengine.plan.search_providers.registry import resolve_provider_id

    monkeypatch.setenv("SEARCH_PROVIDER", "tavily")
    monkeypatch.setenv("TAVILY_API_KEY", "sk-test")
    assert resolve_provider_id() == "tavily"


def test_resolve_provider_auto_picks_configured(monkeypatch) -> None:
    from clipengine.plan.search_providers.registry import resolve_provider_id

    _clear_all_provider_keys(monkeypatch)
    monkeypatch.setenv("EXA_API_KEY", "exa-key")
    assert resolve_provider_id() == "exa"


def test_resolve_provider_falls_back_to_none_when_nothing_configured(monkeypatch) -> None:
    from clipengine.plan.search_providers.registry import resolve_provider_id

    _clear_all_provider_keys(monkeypatch)
    assert resolve_provider_id() == "none"


# ---------------------------------------------------------------------------
# web_search_configured
# ---------------------------------------------------------------------------


def test_web_search_configured_true_when_key_set(monkeypatch) -> None:
    from clipengine.plan.search_providers.registry import web_search_configured

    monkeypatch.delenv("SEARCH_PROVIDER", raising=False)
    monkeypatch.setenv("TAVILY_API_KEY", "sk-test")
    assert web_search_configured() is True


def test_web_search_configured_false_when_provider_none(monkeypatch) -> None:
    from clipengine.plan.search_providers.registry import web_search_configured

    monkeypatch.setenv("SEARCH_PROVIDER", "none")
    assert web_search_configured() is False


# ---------------------------------------------------------------------------
# web_search error cases
# ---------------------------------------------------------------------------


def test_web_search_raises_when_no_provider(monkeypatch) -> None:
    from clipengine.plan.search_providers.registry import web_search

    monkeypatch.setenv("SEARCH_PROVIDER", "none")
    with pytest.raises(ValueError, match="disabled"):
        web_search("test query")


def test_web_search_raises_for_unconfigured_provider(monkeypatch) -> None:
    from clipengine.plan.search_providers.registry import web_search

    monkeypatch.setenv("SEARCH_PROVIDER", "tavily")
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    with pytest.raises(ValueError, match="not configured"):
        web_search("test query")
