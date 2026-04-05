"""Tavily search via MCP stdio (``npx -y tavily-mcp``)."""

from __future__ import annotations

import asyncio
import os
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.types import TextContent

# Fixed launcher and tool (official tavily-mcp package).
_TAVILY_MCP_COMMAND = "npx"
_TAVILY_MCP_ARGS = ("-y", "tavily-mcp")
_TAVILY_MCP_TOOL = "tavily_search"
_TAVILY_MCP_TIMEOUT_S = 120.0


def _child_env() -> dict[str, str]:
    """MCP subprocess env; all values must be str."""
    return {k: v for k, v in os.environ.items() if v is not None}


async def tavily_search_mcp_async(
    query: str,
    *,
    max_results: int = 5,
    search_depth: str = "basic",
) -> str:
    """
    Run the Tavily MCP ``tavily_search`` tool and return text for the LLM.

    Requires ``TAVILY_API_KEY`` (passed through to the MCP server). Requires Node
    on PATH so ``npx`` can run ``tavily-mcp``.
    """
    if not os.environ.get("TAVILY_API_KEY"):
        raise ValueError("TAVILY_API_KEY must be set for the Tavily MCP server process")

    params = StdioServerParameters(
        command=_TAVILY_MCP_COMMAND,
        args=list(_TAVILY_MCP_ARGS),
        env=_child_env(),
    )

    arguments: dict[str, Any] = {
        "query": query,
        "max_results": max_results,
        "search_depth": search_depth,
    }

    async def _run() -> str:
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(_TAVILY_MCP_TOOL, arguments)
                if result.isError:
                    err_parts: list[str] = []
                    for block in result.content:
                        if isinstance(block, TextContent):
                            err_parts.append(block.text)
                    raise RuntimeError(
                        "MCP tool error: " + ("\n".join(err_parts) if err_parts else "unknown")
                    )
                parts: list[str] = []
                for block in result.content:
                    if isinstance(block, TextContent):
                        parts.append(block.text)
                return "\n".join(parts).strip()

    return await asyncio.wait_for(_run(), timeout=_TAVILY_MCP_TIMEOUT_S)


def tavily_search_mcp_sync(
    query: str,
    *,
    max_results: int = 5,
    search_depth: str = "basic",
) -> str:
    """Sync wrapper for CLI code paths."""
    return asyncio.run(
        tavily_search_mcp_async(
            query,
            max_results=max_results,
            search_depth=search_depth,
        )
    )


def format_search_context(text: str, max_chars: int = 8000) -> str:
    """Truncate MCP search text for the LLM prompt."""
    text = text.strip()
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3] + "..."
