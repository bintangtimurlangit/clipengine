"""Perplexity chat (or OpenRouter with a Perplexity model)."""

from __future__ import annotations

import os

import httpx


def search(query: str, *, max_results: int = 5) -> str:
    p_key = os.environ.get("PERPLEXITY_API_KEY")
    model = os.environ.get("PERPLEXITY_MODEL", "sonar")
    if p_key:
        r = httpx.post(
            "https://api.perplexity.ai/chat/completions",
            headers={
                "Authorization": f"Bearer {p_key.strip()}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": query}],
                "max_tokens": min(4096, 800 * max(1, max_results)),
            },
            timeout=120.0,
        )
        r.raise_for_status()
        data = r.json()
        msg = (data.get("choices") or [{}])[0].get("message") or {}
        return str(msg.get("content") or "").strip()
    or_key = os.environ.get("OPENROUTER_API_KEY")
    if not or_key:
        raise ValueError("PERPLEXITY_API_KEY or OPENROUTER_API_KEY must be set for Perplexity search")
    or_model = os.environ.get("OPENROUTER_PERPLEXITY_MODEL", "perplexity/sonar")
    r = httpx.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {or_key.strip()}",
            "Content-Type": "application/json",
            "HTTP-Referer": os.environ.get(
                "OPENROUTER_HTTP_REFERER",
                "https://github.com/bintangtimurlangit/clipengine",
            ),
            "X-Title": "clipengine",
        },
        json={
            "model": or_model,
            "messages": [{"role": "user", "content": query}],
        },
        timeout=120.0,
    )
    r.raise_for_status()
    data = r.json()
    msg = (data.get("choices") or [{}])[0].get("message") or {}
    return str(msg.get("content") or "").strip()
