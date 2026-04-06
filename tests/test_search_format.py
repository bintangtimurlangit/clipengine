"""Tests for search provider format helpers and format_search_context."""

from __future__ import annotations

from clipengine.plan.search import format_search_context
from clipengine.plan.search_providers._format import join_snippet_results


# ---------------------------------------------------------------------------
# join_snippet_results
# ---------------------------------------------------------------------------


def test_join_snippet_results_basic() -> None:
    items = [
        {"title": "Result 1", "content": "Body 1"},
        {"title": "Result 2", "content": "Body 2"},
    ]
    out = join_snippet_results(items, body_keys=("title", "content"))
    assert "Result 1" in out
    assert "Body 1" in out
    assert "Result 2" in out
    assert "Body 2" in out


def test_join_snippet_results_missing_keys_skipped() -> None:
    items = [{"title": "Only title"}]
    out = join_snippet_results(items, body_keys=("title", "content"))
    assert "Only title" in out


def test_join_snippet_results_empty_items() -> None:
    assert join_snippet_results([], body_keys=("title", "content")) == ""


def test_join_snippet_results_all_empty_values() -> None:
    items = [{"title": "", "content": ""}]
    assert join_snippet_results(items, body_keys=("title", "content")) == ""


def test_join_snippet_results_none_values_skipped() -> None:
    items = [{"title": None, "content": "some text"}]
    out = join_snippet_results(items, body_keys=("title", "content"))
    assert "some text" in out
    assert "None" not in out


def test_join_snippet_results_multiple_keys_joined() -> None:
    items = [{"url": "example.com/page", "snippet": "snippet here"}]
    out = join_snippet_results(items, body_keys=("url", "snippet"))
    assert "example.com/page" in out
    assert "snippet here" in out


def test_join_snippet_results_separator_between_items() -> None:
    items = [{"a": "first"}, {"a": "second"}]
    out = join_snippet_results(items, body_keys=("a",))
    assert "first" in out
    assert "second" in out
    assert "\n\n" in out  # items separated by double newline


# ---------------------------------------------------------------------------
# format_search_context
# ---------------------------------------------------------------------------


def test_format_search_context_short_text_unchanged() -> None:
    text = "hello world"
    assert format_search_context(text, max_chars=100) == text


def test_format_search_context_strips_whitespace() -> None:
    assert format_search_context("  hi  ") == "hi"


def test_format_search_context_truncates_long_text() -> None:
    text = "x" * 10_000
    out = format_search_context(text, max_chars=500)
    assert len(out) == 500
    assert out.endswith("...")


def test_format_search_context_exact_length_unchanged() -> None:
    text = "a" * 8000
    assert format_search_context(text, max_chars=8000) == text
