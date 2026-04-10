"""DuckDuckGo: unofficial HTML search via duckduckgo-search (non-JavaScript results pages).

This matches the common “OpenClaw-style” integration: no API key; results are scraped from
DuckDuckGo’s HTML search (not the Instant Answer JSON endpoint). Expect occasional breakage
from bot challenges or HTML changes.

See: https://docs.openclaw.ai/tools/duckduckgo-search
"""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import Any, Optional

from duckduckgo_search import DDGS  # type: ignore[import-untyped]


def _client_timeout_s() -> int:
    for k in ("DUCKDUCKGO_CLIENT_TIMEOUT", "DUCKDUCKGO_PACKAGE_CLIENT_TIMEOUT"):
        v = os.environ.get(k)
        if v is not None and str(v).strip():
            return int(float(str(v).strip()))
    return 25


def _wall_timeout_s() -> float:
    for k in ("DUCKDUCKGO_WALL_TIMEOUT", "DUCKDUCKGO_PACKAGE_WALL_TIMEOUT"):
        v = os.environ.get(k)
        if v is not None and str(v).strip():
            return float(str(v).strip())
    return 45.0


def _region() -> Optional[str]:
    r = (os.environ.get("DUCKDUCKGO_REGION") or "us-en").strip()
    return r or None


def _safesearch() -> str:
    s = (os.environ.get("DUCKDUCKGO_SAFE_SEARCH") or "moderate").strip().lower()
    if s in ("strict", "moderate", "off"):
        return s
    return "moderate"


def _text_backend() -> str:
    """DDGS ``backend`` (e.g. ``auto``, ``html``); ``html`` forces HTML scraping."""
    b = (os.environ.get("DUCKDUCKGO_TEXT_BACKEND") or "auto").strip().lower()
    return b if b else "auto"


def _format_items(items: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for item in items:
        title = str(item.get("title") or "").strip()
        href = str(item.get("href") or "").strip()
        body = str(item.get("body") or "").strip()
        chunk = "\n".join(x for x in (title, href, body) if x)
        if chunk:
            parts.append(chunk)
    return "\n\n".join(parts).strip()


def _search_html(query: str, *, max_results: int) -> str:
    """Run duckduckgo-search in a worker with a hard wall-clock cap."""
    client_timeout = _client_timeout_s()
    wall_s = _wall_timeout_s()

    def _run() -> str:
        with DDGS(timeout=client_timeout) as ddgs:
            items = ddgs.text(
                query,
                region=_region(),
                safesearch=_safesearch(),
                backend=_text_backend(),
                max_results=max_results,
            )
        if not items:
            return ""
        return _format_items(list(items))

    with ThreadPoolExecutor(max_workers=1) as pool:
        fut = pool.submit(_run)
        try:
            return fut.result(timeout=wall_s)
        except FuturesTimeoutError as e:
            raise TimeoutError(
                f"DuckDuckGo HTML search exceeded {wall_s:.0f}s; "
                "increase DUCKDUCKGO_WALL_TIMEOUT or use another SEARCH_PROVIDER"
            ) from e


def search(query: str, *, max_results: int = 5) -> str:
    """Search DuckDuckGo HTML results (``duckduckgo-search`` / DDGS)."""
    return _search_html(query, max_results=max_results)
