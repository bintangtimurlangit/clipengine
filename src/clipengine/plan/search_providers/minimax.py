"""MiniMax Coding Plan search API."""

from __future__ import annotations

import json
import os

import httpx

from clipengine.plan.search_providers._format import join_snippet_results


def _base_url() -> str:
    region = (os.environ.get("MINIMAX_REGION") or "global").strip().lower()
    if region == "cn":
        return os.environ.get("MINIMAX_API_HOST", "https://api.minimaxi.com").rstrip("/")
    return os.environ.get("MINIMAX_API_HOST", "https://api.minimax.io").rstrip("/")


def search(query: str, *, max_results: int = 5) -> str:
    key = (
        os.environ.get("MINIMAX_CODE_PLAN_KEY")
        or os.environ.get("MINIMAX_CODING_API_KEY")
        or os.environ.get("MINIMAX_API_KEY")
    )
    if not key:
        raise ValueError(
            "MINIMAX_CODE_PLAN_KEY or MINIMAX_CODING_API_KEY must be set for MiniMax search"
        )
    base = _base_url()
    r = httpx.post(
        f"{base}/v1/coding_plan/search",
        headers={"Authorization": f"Bearer {key.strip()}"},
        json={"query": query, "count": max_results},
        timeout=90.0,
    )
    r.raise_for_status()
    data = r.json()
    items = data.get("results") or data.get("data") or data.get("items") or []
    if isinstance(items, dict):
        items = items.get("results") or []
    if not isinstance(items, list):
        return json.dumps(data, ensure_ascii=False)[:8000]
    return join_snippet_results(
        [x for x in items if isinstance(x, dict)],
        body_keys=("title", "url", "snippet", "content", "summary"),
    )
