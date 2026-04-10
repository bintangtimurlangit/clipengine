"""Tests for multi-profile LLM normalization and validation."""

from __future__ import annotations

import pytest

from clipengine_api.core.llm_profiles import (
    normalize_stored_llm_profiles,
    validate_llm_profiles_payload,
)


def test_normalize_from_legacy_openai_only() -> None:
    stored = {
        "llm_provider": "openai",
        "openai_api_key": "sk-legacy",
        "openai_model": "gpt-4o-mini",
    }
    out = normalize_stored_llm_profiles(stored)
    assert len(out["llm_profiles"]) >= 1
    primary = next(
        p for p in out["llm_profiles"] if p["id"] == out["llm_primary_id"]
    )
    assert primary["provider"] == "openai"
    assert primary.get("api_key") == "sk-legacy"


def test_validate_llm_profiles_payload_ok() -> None:
    profiles = [
        {
            "id": "a",
            "provider": "openai",
            "api_key": "k",
            "base_url": None,
            "model": "m",
        },
        {
            "id": "b",
            "provider": "anthropic",
            "api_key": "k2",
            "base_url": None,
            "model": None,
        },
    ]
    validate_llm_profiles_payload(profiles, "a", ["b"])


def test_validate_rejects_primary_in_fallbacks() -> None:
    profiles = [
        {"id": "a", "provider": "openai", "api_key": "k"},
        {"id": "b", "provider": "anthropic", "api_key": "k2"},
    ]
    with pytest.raises(ValueError, match="primary"):
        validate_llm_profiles_payload(profiles, "a", ["a"])
