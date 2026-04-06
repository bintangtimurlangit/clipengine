"""Tavily search via the official tavily-python SDK (REST, no subprocess required)."""

from __future__ import annotations

import os
from typing import Any


def _get_client() -> Any:
    try:
        from tavily import TavilyClient  # type: ignore[import-untyped]
    except ImportError as e:
        raise ImportError(
            "tavily-python is required for web search. "
            "Install it with: pip install tavily-python"
        ) from e
    api_key = os.environ.get("TAVILY_API_KEY")
    if not api_key:
        raise ValueError("TAVILY_API_KEY must be set to use Tavily search")
    return TavilyClient(api_key=api_key)


def tavily_search(
    query: str,
    *,
    max_results: int = 5,
    search_depth: str = "basic",
) -> str:
    """Call the Tavily search API and return plain text for the LLM prompt.

    Works in both sync and async contexts (pure HTTP, no subprocess).
    Requires ``TAVILY_API_KEY`` in the environment.
    """
    client = _get_client()
    resp = client.search(query, max_results=max_results, search_depth=search_depth)
    results: list[dict[str, Any]] = resp.get("results", [])
    parts: list[str] = []
    for r in results:
        title = r.get("title") or ""
        content = r.get("content") or ""
        url = r.get("url") or ""
        chunk = "\n".join(filter(None, [title, url, content]))
        if chunk.strip():
            parts.append(chunk)
    return "\n\n".join(parts).strip()


# ------------------------------------------------------------------
# Backwards-compat aliases (callers that used the old MCP names)
# ------------------------------------------------------------------

def tavily_search_mcp_sync(
    query: str,
    *,
    max_results: int = 5,
    search_depth: str = "basic",
) -> str:
    """Deprecated alias — use :func:`tavily_search` directly."""
    return tavily_search(query, max_results=max_results, search_depth=search_depth)


def format_search_context(text: str, max_chars: int = 8000) -> str:
    """Truncate Tavily search text for the LLM prompt."""
    text = text.strip()
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3] + "..."
