"""Programmatic pipeline: ingest → plan → render (used by the HTTP API)."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, IO, TextIO

from rich.console import Console

from clipengine.ingest.audio import extract_audio_wav_16k_mono, probe_duration_s
from clipengine.ingest.transcribe import transcribe_wav, transcript_to_vtt
from clipengine.models import TranscriptDoc
from clipengine.plan.heuristic import build_heuristic_cut_plan
from clipengine.plan.llm import generate_cut_plan, infer_video_foundation, plan_from_json_file, sanitize_cut_plan
from clipengine.plan.search import (
    active_search_stack_label,
    format_search_context,
    web_search,
    web_search_configured,
)
from clipengine.render import render_plan

console = Console()


class _FlushTextWrapper:
    """Wrap a text stream so each write() flushes for live log tailing."""

    __slots__ = ("_f",)

    def __init__(self, f: TextIO) -> None:
        self._f = f

    def write(self, s: str) -> int:
        n = self._f.write(s)
        self._f.flush()
        return n

    def flush(self) -> None:
        self._f.flush()

    def __getattr__(self, name: str) -> Any:
        return getattr(self._f, name)


def run_ingest(
    video: Path,
    output_dir: Path,
    *,
    whisper_model: str = "tiny",
    device: str = "auto",
    compute_type: str = "default",
    language: str | None = None,
) -> Path:
    video = video.resolve()
    if not video.is_file():
        raise FileNotFoundError(str(video))

    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    wav_path = output_dir / "audio_16k_mono.wav"
    transcript_path = output_dir / "transcript.json"

    console.print(f"Probing [cyan]{video}[/cyan]…")
    dur = probe_duration_s(video)
    console.print(f"Duration: {dur:.2f}s")

    console.print("Extracting audio for Whisper…")
    extract_audio_wav_16k_mono(video, wav_path)

    backend = (os.environ.get("CLIPENGINE_TRANSCRIPTION_BACKEND") or "local").lower().strip()
    if backend == "openai_api":
        console.print("Transcribing with OpenAI audio API (whisper-1)…")
        from clipengine.ingest.openai_transcribe import transcribe_wav_openai

        doc = transcribe_wav_openai(wav_path, source_video=video, language=language)
    else:
        console.print(f"Transcribing with local faster-whisper ({whisper_model})…")
        doc = transcribe_wav(
            wav_path,
            source_video=video,
            model_size=whisper_model,
            device=device,
            compute_type=compute_type,
            language=language,
        )

    transcript_path.write_text(doc.model_dump_json(indent=2), encoding="utf-8")
    vtt_path = output_dir / "segments.vtt"
    vtt_path.write_text(transcript_to_vtt(doc), encoding="utf-8")
    console.print(
        f"Wrote [green]{transcript_path}[/green] and [green]{vtt_path}[/green] "
        f"({len(doc.segments)} segments)"
    )
    return transcript_path


def run_plan(
    transcript_path: Path,
    plan_out: Path,
    *,
    title: str | None = None,
    verbose: int = 0,
    llm_activity_log: Path | None = None,
) -> Path:
    transcript_path = transcript_path.resolve()
    raw = transcript_path.read_text(encoding="utf-8")
    doc = TranscriptDoc.model_validate_json(raw)

    llm_log_file: IO[str] | None = None
    llm_console: Console = console
    llm_verbose = verbose
    if llm_activity_log is not None:
        lp = llm_activity_log.resolve()
        lp.parent.mkdir(parents=True, exist_ok=True)
        llm_log_file = lp.open("w", encoding="utf-8")
        llm_console = Console(
            file=_FlushTextWrapper(llm_log_file),
            force_terminal=False,
            width=120,
            soft_wrap=True,
        )
        llm_verbose = max(verbose, 1)
        llm_console.print("[bold]LLM activity[/bold] (foundation + cut plan; web search is not logged here)")

    try:
        return _run_plan_body(
            doc,
            plan_out,
            title=title,
            llm_console=llm_console,
            llm_verbose=llm_verbose,
        )
    finally:
        if llm_log_file is not None:
            llm_log_file.close()


def _run_plan_body(
    doc: TranscriptDoc,
    plan_out: Path,
    *,
    title: str | None,
    llm_console: Console,
    llm_verbose: int,
) -> Path:
    planning_foundation = None
    if web_search_configured():
        label = active_search_stack_label()
        console.print(f"[dim]Web search: enabled ({label}).[/dim]")
        try:
            console.print("Inferring video context (LLM)…")
            planning_foundation = infer_video_foundation(
                doc,
                title=title,
                verbose=llm_verbose,
                console=llm_console,
            )
            console.print(
                "[dim]Identity search query:[/dim] "
                f"{planning_foundation.identity_search_query}"
            )
            console.print(
                "[dim]Highlights search query:[/dim] "
                f"{planning_foundation.highlights_search_query}"
            )
            id_excerpt: str | None = None
            hi_excerpt: str | None = None
            q_id = planning_foundation.identity_search_query.strip()
            q_hi = planning_foundation.highlights_search_query.strip()
            if q_id:
                console.print(f"Searching web ({label}, identity)…")
                id_excerpt = format_search_context(web_search(q_id))
            else:
                console.print(
                    "[yellow]Empty identity search query from LLM; skipping identity web search.[/yellow]"
                )
            if q_hi:
                console.print(f"Searching web ({label}, community highlights)…")
                hi_excerpt = format_search_context(web_search(q_hi))
            else:
                console.print(
                    "[yellow]Empty highlights search query from LLM; skipping highlights web search.[/yellow]"
                )
            planning_foundation = planning_foundation.model_copy(
                update={
                    "tavily_identity_excerpt": id_excerpt,
                    "tavily_highlights_excerpt": hi_excerpt,
                }
            )
        except Exception as e:
            console.print(f"[yellow]Web search foundation pipeline failed: {e}[/yellow]")
            planning_foundation = None
    else:
        console.print(
            "[dim]Web search: skipped (configure main/fallback in Settings or SEARCH_PROVIDER_MAIN — see docs/configuration.md).[/dim]"
        )

    console.print("Calling LLM for cut plan…")
    plan = generate_cut_plan(
        doc,
        title=title,
        planning_foundation=planning_foundation,
        verbose=llm_verbose,
        console=llm_console,
    )

    plan_out = plan_out.resolve()
    plan_out.parent.mkdir(parents=True, exist_ok=True)
    plan_out.write_text(plan.model_dump_json(indent=2), encoding="utf-8")
    console.print(
        f"Wrote [green]{plan_out}[/green] "
        f"({len(plan.longform_clips)} long, {len(plan.shortform_clips)} short)"
    )
    return plan_out


def run_plan_heuristic(
    transcript_path: Path,
    plan_out: Path,
    *,
    title: str | None = None,
) -> Path:
    """Write ``cut_plan.json`` from transcript timing only (no LLM or web search)."""
    _ = title
    transcript_path = transcript_path.resolve()
    raw = transcript_path.read_text(encoding="utf-8")
    doc = TranscriptDoc.model_validate_json(raw)
    console.print("[dim]Plan: heuristic windows (no LLM).[/dim]")
    plan = build_heuristic_cut_plan(doc)
    plan_out = plan_out.resolve()
    plan_out.parent.mkdir(parents=True, exist_ok=True)
    plan_out.write_text(plan.model_dump_json(indent=2), encoding="utf-8")
    console.print(
        f"Wrote [green]{plan_out}[/green] "
        f"({len(plan.longform_clips)} long, {len(plan.shortform_clips)} short, heuristic)"
    )
    return plan_out


def run_render(
    cut_plan_path: Path,
    video: Path,
    output_dir: Path,
    *,
    transcript_path: Path | None = None,
) -> list[Path]:
    cut_plan_path = cut_plan_path.resolve()
    vid = video.resolve()
    plan = plan_from_json_file(str(cut_plan_path))
    plan = sanitize_cut_plan(plan, probe_duration_s(vid))
    output_dir = output_dir.resolve()

    transcript_doc: TranscriptDoc | None = None
    tpath = (transcript_path or (cut_plan_path.parent / "transcript.json")).resolve()
    if tpath.is_file():
        transcript_doc = TranscriptDoc.model_validate_json(tpath.read_text(encoding="utf-8"))
        console.print(f"[dim]Trimming to Whisper segment boundaries ({tpath.name}).[/dim]")
    else:
        console.print(
            "[dim]No transcript.json beside cut plan; using LLM times as-is (may cut mid-speech).[/dim]"
        )

    paths = render_plan(vid, plan, output_dir, transcript_doc=transcript_doc)
    console.print(f"Rendered [green]{len(paths)}[/green] file(s) under {output_dir}")
    return paths
