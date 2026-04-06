"""Brave Search API."""

from __future__ import annotations

import os

import httpx

from clipengine.plan.search_providers._format import join_snippet_results


def search(query: str, *, max_results: int = 5) -> str:
    key = os.environ.get("BRAVE_API_KEY")
    if not key:
        raise ValueError("BRAVE_API_KEY must be set for Brave search")
    r = httpx.get(
        "https://api.search.brave.com/res/v1/web/search",
        params={"q": query, "count": max_results},
        headers={
            "Accept": "application/json",
            "X-Subscription-Token": key.strip(),
        },
        timeout=60.0,
    )
    r.raise_for_status()
    data = r.json()
    web = data.get("web") or {}
    results = web.get("results") or []
    return join_snippet_results(results, body_keys=("title", "url", "description"))
