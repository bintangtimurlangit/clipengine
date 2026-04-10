"""Brave Search API (https://api.search.brave.com/res/v1/web/search)."""

from __future__ import annotations

import os

import httpx

from clipengine.plan.search_providers._format import join_snippet_results


def _subscription_token() -> str:
    return (
        os.environ.get("BRAVE_API_KEY")
        or os.environ.get("BRAVE_SEARCH_API_KEY")
        or ""
    ).strip()


def search(query: str, *, max_results: int = 5) -> str:
    key = _subscription_token()
    if not key:
        raise ValueError(
            "BRAVE_API_KEY or BRAVE_SEARCH_API_KEY must be set for Brave search"
        )
    params: dict[str, str | int] = {"q": query, "count": max_results}
    country = (os.environ.get("BRAVE_SEARCH_COUNTRY") or os.environ.get("BRAVE_COUNTRY") or "").strip()
    if country:
        params["country"] = country.upper()
    r = httpx.get(
        "https://api.search.brave.com/res/v1/web/search",
        params=params,
        headers={
            "Accept": "application/json",
            "X-Subscription-Token": key,
        },
        timeout=60.0,
    )
    r.raise_for_status()
    data = r.json()
    web = data.get("web") or {}
    results = web.get("results") or []
    return join_snippet_results(results, body_keys=("title", "url", "description"))
