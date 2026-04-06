"""Kimi / Moonshot official web-search formula (chat + tool fibers)."""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import quote

import httpx
from openai import OpenAI


def _formula_uri_enc() -> str:
    return quote("moonshot/web-search:latest", safe="")


def search(query: str, *, max_results: int = 5) -> str:
    key = os.environ.get("MOONSHOT_API_KEY") or os.environ.get("KIMI_API_KEY")
    if not key:
        raise ValueError("MOONSHOT_API_KEY or KIMI_API_KEY must be set for Kimi web search")
    base = os.environ.get("MOONSHOT_BASE_URL", "https://api.moonshot.ai/v1").rstrip("/")
    model = os.environ.get("KIMI_MODEL", "kimi-k2.5")
    enc = _formula_uri_enc()
    with httpx.Client(timeout=120.0) as hc:
        tr = hc.get(
            f"{base}/formulas/{enc}/tools",
            headers={"Authorization": f"Bearer {key.strip()}"},
        )
        tr.raise_for_status()
        tools = tr.json().get("tools") or []
        messages: list[dict[str, Any]] = [
            {
                "role": "user",
                "content": query,
            }
        ]
        client = OpenAI(api_key=key.strip(), base_url=base)
        for _ in range(8):
            resp = client.chat.completions.create(
                model=model,
                messages=messages,
                tools=tools,
            )
            choice = resp.choices[0]
            msg = choice.message
            asst: dict[str, Any] = {"role": msg.role, "content": msg.content}
            if msg.tool_calls:
                asst["tool_calls"] = [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in msg.tool_calls
                ]
            messages.append(asst)
            if choice.finish_reason != "tool_calls" or not msg.tool_calls:
                return (msg.content or "").strip()
            for tc in msg.tool_calls:
                fn = tc.function
                fr = hc.post(
                    f"{base}/formulas/{enc}/fibers",
                    headers={"Authorization": f"Bearer {key.strip()}"},
                    json={"name": fn.name, "arguments": fn.arguments},
                )
                fr.raise_for_status()
                fiber = fr.json()
                ctx = fiber.get("context") or {}
                content = ctx.get("output") or ctx.get("encrypted_output") or ""
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": str(content),
                    }
                )
    _ = max_results
    return ""
