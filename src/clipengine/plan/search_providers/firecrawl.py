"""Firecrawl search API."""

from __future__ import annotations

import os

import httpx

from clipengine.plan.search_providers._format import join_snippet_results


def search(query: str, *, max_results: int = 5) -> str:
    key = os.environ.get("FIRECRAWL_API_KEY")
    if not key:
        raise ValueError("FIRECRAWL_API_KEY must be set for Firecrawl search")
    r = httpx.post(
        "https://api.firecrawl.dev/v1/search",
        headers={
            "Authorization": f"Bearer {key.strip()}",
            "Content-Type": "application/json",
        },
        json={"query": query, "limit": max_results},
        timeout=90.0,
    )
    r.raise_for_status()
    data = r.json()
    items = data.get("data") or data.get("results") or []
    if isinstance(items, dict):
        items = items.get("results") or []
    return join_snippet_results(
        [x for x in items if isinstance(x, dict)],
        body_keys=("title", "url", "markdown", "description", "content"),
    )
