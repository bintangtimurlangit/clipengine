"""Unit tests for DuckDuckGo Instant Answer parsing (no network)."""

from __future__ import annotations

import importlib.util
from pathlib import Path


def _load_ddg():
    """Load ``duckduckgo.py`` without importing ``clipengine.plan`` (heavy deps)."""
    root = Path(__file__).resolve().parents[1]
    path = root / "src/clipengine/plan/search_providers/duckduckgo.py"
    spec = importlib.util.spec_from_file_location("_ce_ddg_test", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ddg = _load_ddg()


def test_instant_answer_parts_abstract_and_related() -> None:
    data = {
        "Heading": "Example Corp",
        "AbstractText": "A company.",
        "AbstractURL": "https://example.com/",
        "RelatedTopics": [
            {"Text": "Topic A", "FirstURL": "https://a.example/"},
            {
                "Topics": [
                    {"Text": "Nested B", "FirstURL": "https://b.example/"},
                ]
            },
        ],
        "Results": [{"Text": "Result line", "FirstURL": "https://r.example/"}],
    }
    parts = ddg._instant_answer_parts(data, max_results=10)
    assert len(parts) == 4
    assert "Example Corp" in parts[0]
    assert "Topic A" in parts[1]
    assert "Nested B" in parts[2]
    assert "Result line" in parts[3]


def test_instant_answer_parts_respects_max_results() -> None:
    data = {
        "AbstractText": "Only abstract.",
        "RelatedTopics": [{"Text": "R1", "FirstURL": "https://1/"}, {"Text": "R2", "FirstURL": "https://2/"}],
    }
    parts = ddg._instant_answer_parts(data, max_results=2)
    assert len(parts) == 2


def test_strip_html() -> None:
    assert ddg._strip_html("<a href=\"x\">Hello</a> world") == "Hello world"
