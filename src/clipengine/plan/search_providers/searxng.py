"""SearXNG (self-hosted) JSON API."""

from __future__ import annotations

import os

import httpx

from clipengine.plan.search_providers._format import join_snippet_results


def search(query: str, *, max_results: int = 5) -> str:
    base = os.environ.get("SEARXNG_BASE_URL")
    if not base:
        raise ValueError(
            "SEARXNG_BASE_URL must be set for SearXNG search (self-hosted instance URL)"
        )
    base = base.rstrip("/")
    r = httpx.get(
        f"{base}/search",
        params={"q": query, "format": "json"},
        timeout=60.0,
    )
    r.raise_for_status()
    data = r.json()
    results = data.get("results") or []
    items = results[:max_results]
    return join_snippet_results(
        [x for x in items if isinstance(x, dict)],
        body_keys=("title", "url", "content"),
    )
