"""Gemini with Google Search grounding."""

from __future__ import annotations

import os

import httpx


def search(query: str, *, max_results: int = 5) -> str:
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise ValueError("GEMINI_API_KEY must be set for Gemini web search")
    model = os.environ.get("GEMINI_SEARCH_MODEL", "gemini-2.0-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    r = httpx.post(
        url,
        params={"key": key.strip()},
        json={
            "contents": [{"parts": [{"text": query}]}],
            "tools": [{"google_search": {}}],
        },
        timeout=120.0,
    )
    r.raise_for_status()
    data = r.json()
    cand = (data.get("candidates") or [{}])[0]
    content = cand.get("content") or {}
    parts_out: list[str] = []
    for p in content.get("parts") or []:
        if isinstance(p, dict) and p.get("text"):
            parts_out.append(str(p["text"]))
    text = "\n".join(parts_out).strip()
    gm = cand.get("groundingMetadata")
    if isinstance(gm, dict):
        chunks = gm.get("groundingChunks") or []
        extra: list[str] = []
        for ch in chunks[: max_results * 2]:
            if not isinstance(ch, dict):
                continue
            w = ch.get("web") or {}
            if isinstance(w, dict):
                u = w.get("uri") or ""
                t = w.get("title") or ""
                if u or t:
                    extra.append("\n".join(x for x in (t, u) if x))
        if extra:
            text = (text + "\n\nSources:\n" + "\n".join(extra)).strip()
    return text
