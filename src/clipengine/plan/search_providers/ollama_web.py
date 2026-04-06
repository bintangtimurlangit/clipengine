"""Ollama cloud web search API."""

from __future__ import annotations

import os

import httpx

from clipengine.plan.search_providers._format import join_snippet_results


def search(query: str, *, max_results: int = 5) -> str:
    key = os.environ.get("OLLAMA_API_KEY")
    if not key:
        raise ValueError("OLLAMA_API_KEY must be set for Ollama web search")
    host = os.environ.get("OLLAMA_WEB_SEARCH_HOST", "https://ollama.com").rstrip("/")
    r = httpx.post(
        f"{host}/api/web_search",
        headers={"Authorization": f"Bearer {key.strip()}"},
        json={"query": query, "max_results": max_results},
        timeout=90.0,
    )
    r.raise_for_status()
    data = r.json()
    results = data.get("results") or []
    return join_snippet_results(
        [x for x in results if isinstance(x, dict)],
        body_keys=("title", "url", "content"),
    )
