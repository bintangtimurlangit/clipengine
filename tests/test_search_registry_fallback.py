"""Tests for main/fallback search provider chain (no network)."""

from __future__ import annotations

import pytest


def test_web_search_uses_fallback_when_primary_returns_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SEARCH_PROVIDER_MAIN", "tavily")
    monkeypatch.setenv("SEARCH_PROVIDER_FALLBACK", "duckduckgo")
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")
    monkeypatch.delenv("SEARCH_PROVIDER", raising=False)

    from clipengine.plan.search_providers import registry

    def _empty_tavily(query: str, *, max_results: int = 5) -> str:
        return ""

    def _fake_ddg(query: str, *, max_results: int = 5) -> str:
        return "from-ddg"

    monkeypatch.setattr(registry, "_tavily_run", _empty_tavily)
    monkeypatch.setitem(registry._DISPATCH, "duckduckgo", _fake_ddg)

    assert registry.web_search("q").strip() == "from-ddg"


def test_active_search_stack_label_shows_arrow(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SEARCH_PROVIDER_MAIN", "brave")
    monkeypatch.setenv("SEARCH_PROVIDER_FALLBACK", "duckduckgo")
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    monkeypatch.delenv("SEARCH_PROVIDER", raising=False)

    from clipengine.plan.search_providers.registry import active_search_stack_label

    assert active_search_stack_label() == "brave→duckduckgo"
