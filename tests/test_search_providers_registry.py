"""Tests for search provider id normalization (no network)."""

from __future__ import annotations

from clipengine.plan.search_providers.registry import normalize_provider_id


def test_normalize_aliases() -> None:
    assert normalize_provider_id("ddg") == "duckduckgo"
    assert normalize_provider_id("XAI") == "grok"
    assert normalize_provider_id("none") == "none"
    assert normalize_provider_id("") == "auto"
