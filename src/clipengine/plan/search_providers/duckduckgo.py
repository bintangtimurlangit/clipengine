"""DuckDuckGo: official Instant Answer JSON API (GET), optional duckduckgo-search fallback."""

from __future__ import annotations

import html
import os
import re
from typing import Any

import httpx

_IA_URL = "https://api.duckduckgo.com/"
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _strip_html(s: str) -> str:
    s = _TAG_RE.sub(" ", s)
    s = html.unescape(s)
    return _WS_RE.sub(" ", s).strip()


def _walk_related_topics(
    topics: list[Any],
    parts: list[str],
    *,
    max_results: int,
) -> None:
    for t in topics:
        if len(parts) >= max_results:
            return
        if not isinstance(t, dict):
            continue
        nested = t.get("Topics")
        if isinstance(nested, list):
            _walk_related_topics(nested, parts, max_results=max_results)
            continue
        text = _strip_html(str(t.get("Text") or ""))
        url = str(t.get("FirstURL") or "").strip()
        if not text and not url:
            continue
        chunk = "\n".join(x for x in (text, url) if x)
        if chunk:
            parts.append(chunk)


def _instant_answer_parts(data: dict[str, Any], *, max_results: int) -> list[str]:
    parts: list[str] = []

    heading = str(data.get("Heading") or "").strip()
    abstract = str(data.get("AbstractText") or "").strip()
    if abstract or heading:
        lines = [
            x
            for x in (
                heading,
                abstract,
                str(data.get("AbstractURL") or "").strip(),
                str(data.get("AbstractSource") or "").strip(),
            )
            if x
        ]
        if lines:
            parts.append("\n".join(lines))

    ans = str(data.get("Answer") or "").strip()
    if ans and len(parts) < max_results:
        parts.append(ans)

    _walk_related_topics(list(data.get("RelatedTopics") or []), parts, max_results=max_results)

    for r in data.get("Results") or []:
        if len(parts) >= max_results:
            break
        if not isinstance(r, dict):
            continue
        text = _strip_html(str(r.get("Text") or str(r.get("Result") or "")))
        url = str(r.get("FirstURL") or "").strip()
        if not text and not url:
            continue
        chunk = "\n".join(x for x in (text, url) if x)
        if chunk:
            parts.append(chunk)

    return parts[:max_results]


def _search_instant_answer(query: str, *, max_results: int) -> str:
    r = httpx.get(
        _IA_URL,
        params={
            "q": query,
            "format": "json",
            "no_html": "1",
            "skip_disambig": "1",
        },
        headers={
            "Accept": "application/json",
            "User-Agent": "Clipengine/1.0 (+https://github.com/bintangtimurlangit/clipengine)",
        },
        timeout=60.0,
    )
    r.raise_for_status()
    data = r.json()
    if not isinstance(data, dict):
        return ""
    parts = _instant_answer_parts(data, max_results=max_results)
    return "\n\n".join(parts).strip()


def _search_package(query: str, *, max_results: int) -> str:
    try:
        from duckduckgo_search import DDGS  # type: ignore[import-untyped]
    except ImportError as e:
        raise ImportError(
            "duckduckgo-search is required when DUCKDUCKGO_BACKEND=package. "
            "Install: pip install duckduckgo-search"
        ) from e
    parts: list[str] = []
    with DDGS() as ddgs:
        for item in ddgs.text(query, max_results=max_results):
            title = item.get("title") or ""
            href = item.get("href") or ""
            body = item.get("body") or ""
            chunk = "\n".join(x for x in (title, href, body) if str(x).strip())
            if chunk:
                parts.append(chunk)
    return "\n\n".join(parts).strip()


def search(query: str, *, max_results: int = 5) -> str:
    """Search DuckDuckGo.

    **instant** — GET ``https://api.duckduckgo.com/?format=json`` (official Instant Answer API;
    no API key; best for entity/knowledge queries; may return nothing for generic web queries).

    **package** — uses the ``duckduckgo-search`` library (full web-style snippets; optional install).

    **auto** (default) — try **instant**, then **package** if the first response is empty and
    ``duckduckgo-search`` is installed.
    """
    backend = (os.environ.get("DUCKDUCKGO_BACKEND") or "auto").strip().lower()
    if backend in ("", "auto"):
        text = _search_instant_answer(query, max_results=max_results)
        if text.strip():
            return text
        try:
            return _search_package(query, max_results=max_results)
        except ImportError:
            return ""
    if backend == "instant":
        return _search_instant_answer(query, max_results=max_results)
    if backend == "package":
        return _search_package(query, max_results=max_results)
    raise ValueError(
        f"Invalid DUCKDUCKGO_BACKEND={backend!r}; use auto, instant, or package."
    )
