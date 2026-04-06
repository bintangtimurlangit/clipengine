"""Exa search API."""

from __future__ import annotations

import os
from typing import Any

import httpx


def search(query: str, *, max_results: int = 5) -> str:
    key = os.environ.get("EXA_API_KEY")
    if not key:
        raise ValueError("EXA_API_KEY must be set for Exa search")
    r = httpx.post(
        "https://api.exa.ai/search",
        headers={"x-api-key": key.strip(), "Content-Type": "application/json"},
        json={
            "query": query,
            "numResults": max_results,
            "contents": {"text": {"maxCharacters": 2000}},
        },
        timeout=90.0,
    )
    r.raise_for_status()
    data = r.json()
    results: list[dict[str, Any]] = data.get("results") or []
    parts: list[str] = []
    for item in results:
        title = item.get("title") or ""
        url = item.get("url") or ""
        text = ""
        c = item.get("text")
        if isinstance(c, str):
            text = c
        parts.append("\n".join(x for x in (title, url, text) if x))
    return "\n\n".join(p for p in parts if p.strip()).strip()
