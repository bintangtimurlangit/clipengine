"""Stage 2 – Plan: LLM cut planning, web search, and clip boundary snapping."""

from clipengine.plan.llm import (
    generate_cut_plan,
    infer_video_foundation,
    plan_from_json_file,
    sanitize_cut_plan,
    sanitize_cut_plan_with_report,
    SanitizeDrop,
    SanitizeReport,
)
from clipengine.plan.search import (
    active_provider_label,
    active_search_stack_label,
    format_search_context,
    tavily_search,
    tavily_search_mcp_sync,
    web_search,
    web_search_configured,
)
from clipengine.plan.snap import snap_clip_to_transcript

__all__ = [
    "generate_cut_plan",
    "infer_video_foundation",
    "plan_from_json_file",
    "sanitize_cut_plan",
    "sanitize_cut_plan_with_report",
    "SanitizeDrop",
    "SanitizeReport",
    "format_search_context",
    "active_provider_label",
    "active_search_stack_label",
    "tavily_search",
    "tavily_search_mcp_sync",
    "web_search",
    "web_search_configured",
    "snap_clip_to_transcript",
]
