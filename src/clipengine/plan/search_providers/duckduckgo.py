"""DuckDuckGo (duckduckgo-search package)."""

from __future__ import annotations


def search(query: str, *, max_results: int = 5) -> str:
    try:
        from duckduckgo_search import DDGS  # type: ignore[import-untyped]
    except ImportError as e:
        raise ImportError(
            "duckduckgo-search is required for DuckDuckGo search. "
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
