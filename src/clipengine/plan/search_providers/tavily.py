"""Tavily (tavily-python SDK)."""

from __future__ import annotations

import os
from typing import Any

from clipengine.plan.search_providers._format import join_snippet_results


def search(
    query: str, *, max_results: int = 5, search_depth: str = "basic"
) -> str:
    from tavily import TavilyClient  # type: ignore[import-untyped]

    api_key = os.environ.get("TAVILY_API_KEY")
    if not api_key:
        raise ValueError("TAVILY_API_KEY must be set for Tavily search")
    client = TavilyClient(api_key=api_key)
    resp = client.search(query, max_results=max_results, search_depth=search_depth)
    results: list[dict[str, Any]] = resp.get("results", [])
    return join_snippet_results(results, body_keys=("title", "url", "content"))
