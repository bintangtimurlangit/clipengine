"""LLM backends: OpenAI-compatible chat API and Anthropic Messages API."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from typing import Any, Literal

from openai import OpenAI
from rich.console import Console

from clip_engine.models import ClipItem, CutPlan, TranscriptDoc, VideoPlanningFoundation

LLMProvider = Literal["openai", "anthropic"]


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or not str(raw).strip():
        return default
    return float(str(raw).strip())


# Enforced in sanitize_cut_plan (after timestamp clamping).
LONGFORM_MIN_DURATION_S = _env_float("CLIP_ENGINE_LONGFORM_MIN_S", 180.0)  # 3 minutes
# Keep longform to one or two scenes; multi-scene 10+ minute compilations are rejected.
LONGFORM_MAX_DURATION_S = _env_float("CLIP_ENGINE_LONGFORM_MAX_S", 360.0)  # 6 minutes
SHORTFORM_MIN_DURATION_S = _env_float("CLIP_ENGINE_SHORTFORM_MIN_S", 27.0)
# ~1 minute cap with headroom for natural cuts (e.g. 1:05–1:20).
SHORTFORM_MAX_DURATION_S = _env_float("CLIP_ENGINE_SHORTFORM_MAX_S", 80.0)


@dataclass
class SanitizeDrop:
    """One clip removed or adjusted during sanitize (for verbose logging)."""

    kind: Literal["longform", "shortform"]
    title: str
    start_s: float
    end_s: float
    reason: str


@dataclass
class SanitizeReport:
    longform_in: int
    shortform_in: int
    longform_out: int
    shortform_out: int
    drops: list[SanitizeDrop] = field(default_factory=list)


def _get_llm_provider() -> LLMProvider:
    raw = (os.environ.get("LLM_PROVIDER") or "openai").lower().strip()
    if raw in ("anthropic", "claude"):
        return "anthropic"
    if raw in ("openai", "openai_compat", "openai-compatible", "oai"):
        return "openai"
    raise ValueError("LLM_PROVIDER must be 'openai' or 'anthropic'")


def _get_openai_client() -> OpenAI:
    api_key = os.environ.get("OPENAI_API_KEY")
    base_url = os.environ.get("OPENAI_BASE_URL")
    if not api_key:
        raise ValueError("Set OPENAI_API_KEY for OpenAI-compatible mode (see MiniMax OpenAI API docs)")
    kwargs: dict[str, Any] = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    return OpenAI(**kwargs)


def _get_openai_model() -> str:
    return os.environ.get("OPENAI_MODEL") or "gpt-4o-mini"


def _get_anthropic_model() -> str:
    return os.environ.get("ANTHROPIC_MODEL") or "claude-3-5-sonnet-20241022"


def _anthropic_client():
    from anthropic import Anthropic

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("Set ANTHROPIC_API_KEY for Anthropic mode (see MiniMax Anthropic API docs)")
    base_url = os.environ.get("ANTHROPIC_BASE_URL")
    kwargs: dict[str, Any] = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    return Anthropic(**kwargs)


def format_transcript_for_prompt(doc: TranscriptDoc, max_chars: int = 100_000) -> str:
    """Timestamped lines; truncate from the middle if too long."""
    lines: list[str] = []
    for seg in doc.segments:
        lines.append(f"[{seg.start:.2f}s - {seg.end:.2f}s] {seg.text}")
    text = "\n".join(lines)
    if len(text) <= max_chars:
        return text
    head = max_chars // 2 - 50
    tail = max_chars - head - 50
    return (
        text[:head]
        + "\n\n... [middle of transcript omitted for length] ...\n\n"
        + text[-tail:]
    )


def _extract_json_object(raw: str) -> dict[str, Any]:
    raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{[\s\S]*\}\s*$", raw)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    raise ValueError("Model did not return valid JSON")


def _chat_openai_json(client: OpenAI, model: str, system: str, user: str) -> str:
    """OpenAI-compatible chat; request JSON when supported."""
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.3,
            response_format={"type": "json_object"},
        )
    except Exception:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.3,
        )
    choice = resp.choices[0].message.content
    if not choice:
        raise ValueError("Empty LLM response")
    return choice


def _chat_anthropic_json(system: str, user: str) -> str:
    """Anthropic Messages API; JSON-only via prompt (no native json_object mode)."""
    client = _anthropic_client()
    model = _get_anthropic_model()
    max_tokens = int(os.environ.get("ANTHROPIC_MAX_TOKENS", "16384"))

    msg = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        temperature=0.3,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    parts: list[str] = []
    for block in msg.content:
        if block.type == "text":
            parts.append(block.text)
    raw = "".join(parts).strip()
    if not raw:
        raise ValueError("Empty Anthropic response")
    return raw


def _truncate_middle(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    head = max_chars // 2 - 20
    tail = max_chars - head - 40
    return text[:head] + "\n… [truncated] …\n" + text[-tail:]


def infer_video_foundation(
    doc: TranscriptDoc,
    *,
    title: str | None = None,
    search_hint: str | None = None,
    verbose: int = 0,
    console: Console | None = None,
) -> VideoPlanningFoundation:
    """
    First planning step: acknowledge what the video likely is and produce two Tavily queries —
    one to identify the video, one to find community-discussed highlights.
    """
    out = console or Console()
    provider = _get_llm_provider()
    transcript_block = format_transcript_for_prompt(doc, max_chars=60_000)
    meta: list[str] = []
    if title:
        meta.append(f"User/video title or series context: {title}")
    if doc.language:
        meta.append(f"Detected transcript language: {doc.language}")
    meta.append(f"Video duration (seconds): {doc.duration_s:.2f}")
    if search_hint:
        meta.append(f"User search hint (optional): {search_hint}")
    meta_text = "\n".join(meta) if meta else "No extra title/context."

    system = (
        "You analyze a video transcript and decide what video or content it likely is. "
        "You ONLY output a single JSON object, no markdown, no code fences. Shape:\n"
        '{"foundation_summary":string,"identity_search_query":string,"highlights_search_query":string}\n'
        "- foundation_summary: Several sentences. Acknowledge likely show, film, episode, creator, or topic. "
        "State uncertainty if the transcript is ambiguous.\n"
        "- identity_search_query: ONE concise web search query to identify this specific video "
        "(official title, episode name, series, year, or release). Use English unless the content is clearly "
        "non-English only.\n"
        "- highlights_search_query: ONE concise web search query to find what scenes, moments, quotes, or beats "
        "fans, Reddit threads, or articles discuss most (best moments, viral clips, memes, controversial scenes) "
        "for this same video or episode.\n"
        "Do not invent timestamps. Queries should be usable for a news-style web search API."
    )

    user = f"{meta_text}\n\nTranscript with timestamps:\n{transcript_block}\n"

    if verbose >= 2:
        out.print("[bold]--- Foundation LLM system prompt ---[/bold]")
        out.print(system)
        out.print("[bold]--- Foundation LLM user message (may be truncated) ---[/bold]")
        out.print(_truncate_middle(user, 24_000))

    if provider == "openai":
        client = _get_openai_client()
        model = _get_openai_model()
        raw = _chat_openai_json(client, model, system, user)
    else:
        raw = _chat_anthropic_json(system, user)

    if verbose >= 1:
        out.print("[bold]--- Raw foundation LLM response ---[/bold]")
        out.print(raw if len(raw) < 40_000 else _truncate_middle(raw, 40_000))

    data = _extract_json_object(raw)
    return VideoPlanningFoundation.model_validate(data)


def generate_cut_plan(
    doc: TranscriptDoc,
    *,
    title: str | None = None,
    tavily_context: str | None = None,
    planning_foundation: VideoPlanningFoundation | None = None,
    verbose: int = 0,
    console: Console | None = None,
) -> CutPlan:
    """Call configured LLM provider; return validated CutPlan."""
    out = console or Console()
    provider = _get_llm_provider()

    transcript_block = format_transcript_for_prompt(doc)
    meta = []
    if title:
        meta.append(f"User/video title or series context: {title}")
    if doc.language:
        meta.append(f"Detected transcript language: {doc.language}")
    meta.append(f"Video duration (seconds): {doc.duration_s:.2f}")
    meta_text = "\n".join(meta) if meta else "No extra title/context."

    context_block = ""
    if planning_foundation is not None:
        id_ex = planning_foundation.tavily_identity_excerpt or "(no identity search results)"
        hi_ex = planning_foundation.tavily_highlights_excerpt or "(no highlights search results)"
        context_block = (
            "## Video foundation (from transcript; acknowledge this as the working hypothesis)\n"
            f"{planning_foundation.foundation_summary}\n\n"
            "## Web context: identify / catalog (Tavily)\n"
            f"Search query used: {planning_foundation.identity_search_query}\n"
            f"{id_ex}\n\n"
            "## Web context: community highlights & discussion (Tavily)\n"
            f"Search query used: {planning_foundation.highlights_search_query}\n"
            f"{hi_ex}\n\n"
            "Use the foundation and web context to prioritize shortform clips that match widely discussed or "
            "fan-favorite beats when those moments clearly appear in the transcript below. "
            "If the web mentions a moment that is not in the transcript, do not invent it—only use timestamps "
            "that exist in the transcript.\n\n"
        )
    elif tavily_context:
        context_block = (
            "Optional web context (may contain spoilers or general facts; use only to "
            "understand naming/themes, not to invent timestamps):\n"
            + tavily_context
            + "\n\n"
        )

    foundation_rules = ""
    if planning_foundation is not None:
        foundation_rules = (
            "- You have been given a video foundation plus Tavily results about identity and community highlights. "
            "Prioritize shortform windows that align with highlight themes from the web when the transcript "
            "contains matching dialogue or beats; cite that alignment briefly in rationale where relevant.\n"
        )

    system = (
        "You are a video editor assistant. You ONLY output a single JSON object, no markdown, "
        "no code fences. The JSON must match this shape exactly:\n"
        '{"longform_clips":[{"start_s":number,"end_s":number,"title":string,"rationale":string}],'
        '"shortform_clips":[{"start_s":number,"end_s":number,"title":string,"rationale":string}],'
        '"notes":string or null,'
        '"editorial_summary":string or null}\n'
        "Rules:\n"
        "- start_s and end_s are seconds from the start of the source video; 0 <= start_s < end_s <= duration.\n"
        f"- Longform (landscape): each clip must be between {LONGFORM_MIN_DURATION_S:.0f}s and "
        f"{LONGFORM_MAX_DURATION_S:.0f}s. Each longform must cover **one continuous scene** or **at most two** "
        "tightly related scenes (same beat / location / story thread). Do **not** merge many unrelated scenes "
        "into one long clip—if you need more coverage, output **multiple** longform entries instead.\n"
        f"- Shortform (vertical): each clip must be between {SHORTFORM_MIN_DURATION_S:.0f}s and "
        f"{SHORTFORM_MAX_DURATION_S:.0f}s (about one minute max, with a little slack for clean in/out points).\n"
        "Choose start_s/end_s on transcript boundaries; clips outside these duration bounds are discarded.\n"
        "- You decide how many longform and how many shortform clips this single video supports; "
        "prefer multiple strong shortform moments when the transcript has distinct beats, hooks, or punchlines; "
        "use empty arrays only when truly not warranted.\n"
        "- Base every window on the transcript timestamps; do not guess beyond the provided text.\n"
        "- Titles should be concise and engaging.\n"
        + foundation_rules
        + "- editorial_summary (required): Write several detailed paragraphs covering: (1) how many longform vs "
        "shortform clips you chose and why that split fits this video; (2) how you ranked or prioritized "
        "shortform-worthy moments (hooks, emotional peaks, quotable lines)—and if web highlight context was "
        "provided, how it influenced choices; (3) transcript regions you considered "
        "for shorts but skipped and why (e.g. too short after min duration, weak beat, overlap with a longer clip); "
        "(4) any pacing or density notes. This field is for the human editor to audit your reasoning."
    )

    user = (
        f"{meta_text}\n\n"
        f"{context_block}"
        "Transcript with timestamps:\n"
        f"{transcript_block}\n"
    )

    if verbose >= 2:
        out.print("[bold]--- LLM system prompt ---[/bold]")
        out.print(system)
        out.print("[bold]--- LLM user message (may be truncated in display) ---[/bold]")
        out.print(_truncate_middle(user, 24_000))

    if provider == "openai":
        client = _get_openai_client()
        model = _get_openai_model()
        raw = _chat_openai_json(client, model, system, user)
    else:
        raw = _chat_anthropic_json(system, user)

    if verbose >= 1:
        out.print("[bold]--- Raw LLM response (before sanitize) ---[/bold]")
        out.print(raw if len(raw) < 120_000 else _truncate_middle(raw, 120_000))

    data = _extract_json_object(raw)
    plan = CutPlan.model_validate(data)

    if verbose >= 1:
        out.print(
            f"[bold]--- Parsed plan (pre-sanitize) ---[/bold]\n"
            f"longform: {len(plan.longform_clips)}, shortform: {len(plan.shortform_clips)}"
        )
        if plan.notes:
            out.print("[bold]notes[/bold]")
            out.print(plan.notes)
        if plan.editorial_summary:
            out.print("[bold]editorial_summary[/bold]")
            out.print(plan.editorial_summary)
        for i, c in enumerate(plan.longform_clips, 1):
            out.print(
                f"  [cyan]long {i}[/cyan] {c.start_s:.1f}–{c.end_s:.1f}s "
                f"[magenta]{c.title}[/magenta] — {c.rationale}"
            )
        for i, c in enumerate(plan.shortform_clips, 1):
            out.print(
                f"  [cyan]short {i}[/cyan] {c.start_s:.1f}–{c.end_s:.1f}s "
                f"[magenta]{c.title}[/magenta] — {c.rationale}"
            )

    plan, report = sanitize_cut_plan_with_report(plan, doc.duration_s)

    if planning_foundation is not None:
        plan = plan.model_copy(update={"planning_foundation": planning_foundation})

    if verbose >= 1:
        out.print(
            f"[bold]--- After sanitize (long {LONGFORM_MIN_DURATION_S:.0f}–{LONGFORM_MAX_DURATION_S:.0f}s, "
            f"short {SHORTFORM_MIN_DURATION_S:.0f}–{SHORTFORM_MAX_DURATION_S:.0f}s) ---[/bold]\n"
            f"longform: {report.longform_in} → {report.longform_out}, "
            f"shortform: {report.shortform_in} → {report.shortform_out}"
        )
        if report.drops:
            out.print("[bold]Dropped / rejected clips[/bold]")
            for d in report.drops:
                out.print(
                    f"  [{d.kind}] {d.start_s:.1f}–{d.end_s:.1f}s "
                    f"[magenta]{d.title}[/magenta] — [yellow]{d.reason}[/yellow]"
                )
        elif report.longform_in or report.shortform_in:
            out.print("[dim]No clips dropped by sanitize.[/dim]")

    return plan


def _fix_clip_bounds(c: ClipItem, duration_s: float) -> tuple[ClipItem | None, str | None]:
    """Clamp to [0, duration_s]. Return (clip, None) or (None, drop reason)."""
    if c.end_s <= c.start_s:
        return None, "end_s <= start_s"
    start = max(0.0, min(c.start_s, duration_s))
    end = max(0.0, min(c.end_s, duration_s))
    if start >= end:
        return None, "empty or inverted window after clamping to video duration"
    if end - start < 1.0:
        return None, f"span {end - start:.2f}s < 1s after clamp"
    return (
        ClipItem(
            start_s=start,
            end_s=end,
            title=c.title,
            rationale=c.rationale,
        ),
        None,
    )


def sanitize_cut_plan_with_report(plan: CutPlan, duration_s: float) -> tuple[CutPlan, SanitizeReport]:
    """Clamp timestamps, drop invalid clips, enforce min duration per kind; report drops."""

    drops: list[SanitizeDrop] = []
    longs: list[ClipItem] = []
    shorts: list[ClipItem] = []

    for c in plan.longform_clips:
        fixed, err = _fix_clip_bounds(c, duration_s)
        if err:
            drops.append(
                SanitizeDrop(
                    "longform",
                    c.title or "(untitled)",
                    c.start_s,
                    c.end_s,
                    err,
                )
            )
            continue
        assert fixed is not None
        dur = fixed.end_s - fixed.start_s
        if dur < LONGFORM_MIN_DURATION_S:
            drops.append(
                SanitizeDrop(
                    "longform",
                    fixed.title or "(untitled)",
                    fixed.start_s,
                    fixed.end_s,
                    f"duration {dur:.1f}s < longform minimum {LONGFORM_MIN_DURATION_S:.0f}s",
                )
            )
            continue
        if dur > LONGFORM_MAX_DURATION_S:
            drops.append(
                SanitizeDrop(
                    "longform",
                    fixed.title or "(untitled)",
                    fixed.start_s,
                    fixed.end_s,
                    f"duration {dur:.1f}s > longform maximum {LONGFORM_MAX_DURATION_S:.0f}s (use per-scene clips)",
                )
            )
            continue
        longs.append(fixed)

    for c in plan.shortform_clips:
        fixed, err = _fix_clip_bounds(c, duration_s)
        if err:
            drops.append(
                SanitizeDrop(
                    "shortform",
                    c.title or "(untitled)",
                    c.start_s,
                    c.end_s,
                    err,
                )
            )
            continue
        assert fixed is not None
        dur = fixed.end_s - fixed.start_s
        if dur < SHORTFORM_MIN_DURATION_S:
            drops.append(
                SanitizeDrop(
                    "shortform",
                    fixed.title or "(untitled)",
                    fixed.start_s,
                    fixed.end_s,
                    f"duration {dur:.1f}s < shortform minimum {SHORTFORM_MIN_DURATION_S:.0f}s",
                )
            )
            continue
        if dur > SHORTFORM_MAX_DURATION_S:
            drops.append(
                SanitizeDrop(
                    "shortform",
                    fixed.title or "(untitled)",
                    fixed.start_s,
                    fixed.end_s,
                    f"duration {dur:.1f}s > shortform maximum {SHORTFORM_MAX_DURATION_S:.0f}s",
                )
            )
            continue
        shorts.append(fixed)

    report = SanitizeReport(
        longform_in=len(plan.longform_clips),
        shortform_in=len(plan.shortform_clips),
        longform_out=len(longs),
        shortform_out=len(shorts),
        drops=drops,
    )
    out = CutPlan(
        longform_clips=longs,
        shortform_clips=shorts,
        notes=plan.notes,
        editorial_summary=plan.editorial_summary,
        planning_foundation=plan.planning_foundation,
    )
    return out, report


def sanitize_cut_plan(plan: CutPlan, duration_s: float) -> CutPlan:
    """Clamp timestamps to video bounds, drop invalid clips, enforce min duration per kind."""
    fixed, _ = sanitize_cut_plan_with_report(plan, duration_s)
    return fixed


def plan_from_json_file(path: str) -> CutPlan:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return CutPlan.model_validate(data)
