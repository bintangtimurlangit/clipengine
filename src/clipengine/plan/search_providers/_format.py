"""Shared formatting for snippet-style search results."""

from __future__ import annotations

from typing import Any


def join_snippet_results(
    items: list[dict[str, Any]], *, body_keys: tuple[str, ...]
) -> str:
    parts: list[str] = []
    for r in items:
        lines: list[str] = []
        for k in body_keys:
            v = r.get(k)
            if v:
                lines.append(str(v).strip())
        chunk = "\n".join(lines)
        if chunk:
            parts.append(chunk)
    return "\n\n".join(parts).strip()
