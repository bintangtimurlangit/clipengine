"""xAI Grok Responses API with web_search tool."""

from __future__ import annotations

import json
import os
from typing import Any

import httpx


def _collect_text(obj: Any) -> list[str]:
    out: list[str] = []
    if isinstance(obj, str) and obj.strip():
        out.append(obj.strip())
    elif isinstance(obj, dict):
        t = obj.get("text")
        if isinstance(t, str) and t.strip():
            out.append(t.strip())
        for k in ("output", "content", "message", "messages", "items"):
            if k in obj:
                out.extend(_collect_text(obj[k]))
        for v in obj.values():
            if isinstance(v, (list, dict)):
                out.extend(_collect_text(v))
    elif isinstance(obj, list):
        for x in obj:
            out.extend(_collect_text(x))
    return out


def search(query: str, *, max_results: int = 5) -> str:
    key = os.environ.get("XAI_API_KEY")
    if not key:
        raise ValueError("XAI_API_KEY must be set for Grok web search")
    model = os.environ.get("XAI_SEARCH_MODEL", "grok-2-latest")
    r = httpx.post(
        "https://api.x.ai/v1/responses",
        headers={
            "Authorization": f"Bearer {key.strip()}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "input": [{"role": "user", "content": query}],
            "tools": [{"type": "web_search"}],
        },
        timeout=180.0,
    )
    r.raise_for_status()
    data = r.json()
    parts = _collect_text(data)
    text = "\n\n".join(dict.fromkeys(parts))
    if not text.strip():
        return json.dumps(data, ensure_ascii=False)[:8000]
    _ = max_results
    return text.strip()
