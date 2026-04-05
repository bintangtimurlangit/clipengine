"""Typer CLI: ingest, plan, render."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Annotated, Optional

import typer
from dotenv import load_dotenv
from rich.console import Console

from clip_engine.ffmpeg_ops import extract_audio_wav_16k_mono, probe_duration_s
from clip_engine.llm import generate_cut_plan, infer_video_foundation, plan_from_json_file, sanitize_cut_plan
from clip_engine.models import TranscriptDoc
from clip_engine.render import render_plan
from clip_engine.tavily_client import format_search_context, tavily_search_mcp_sync
from clip_engine.transcribe import transcribe_wav
from clip_engine.vtt import transcript_to_vtt

load_dotenv()

app = typer.Typer(no_args_is_help=True, help="Clip Engine: episode to longform/shortform clips.")
console = Console()


def _cli_verbose(ctx: typer.Context | None) -> int:
    """Read -v count from the group callback (Typer stores it on parent context)."""
    if ctx is None:
        return 0
    for c in (ctx, getattr(ctx, "parent", None)):
        if c is not None and getattr(c, "obj", None):
            v = c.obj.get("verbose")
            if v is not None:
                return int(v)
    return 0


@app.callback()
def main(
    ctx: typer.Context,
    verbose: Annotated[
        int,
        typer.Option(
            "--verbose",
            "-v",
            count=True,
            help=(
                "For `plan` / `run-all`: show LLM output and sanitize details. "
                "-v: raw JSON, per-clip rationales, dropped clips. "
                "-vv: also print system + user prompts (transcript may be truncated)."
            ),
        ),
    ] = 0,
) -> None:
    ctx.ensure_object(dict)
    ctx.obj["verbose"] = verbose


def run_ingest(
    video: Path,
    output_dir: Path,
    *,
    whisper_model: str = "base",
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
) -> Path:
    transcript_path = transcript_path.resolve()
    raw = transcript_path.read_text(encoding="utf-8")
    doc = TranscriptDoc.model_validate_json(raw)

    planning_foundation = None
    if os.environ.get("TAVILY_API_KEY"):
        console.print("[dim]Web search: enabled (TAVILY_API_KEY).[/dim]")
        try:
            console.print("Inferring video context (LLM)…")
            planning_foundation = infer_video_foundation(
                doc,
                title=title,
                verbose=verbose,
                console=console,
            )
            console.print(
                "[dim]Tavily identity query:[/dim] "
                f"{planning_foundation.identity_search_query}"
            )
            console.print(
                "[dim]Tavily highlights query:[/dim] "
                f"{planning_foundation.highlights_search_query}"
            )
            id_excerpt: str | None = None
            hi_excerpt: str | None = None
            q_id = planning_foundation.identity_search_query.strip()
            q_hi = planning_foundation.highlights_search_query.strip()
            if q_id:
                console.print("Searching Tavily (identity)…")
                id_excerpt = format_search_context(tavily_search_mcp_sync(q_id))
            else:
                console.print("[yellow]Empty identity search query from LLM; skipping identity Tavily search.[/yellow]")
            if q_hi:
                console.print("Searching Tavily (community highlights)…")
                hi_excerpt = format_search_context(tavily_search_mcp_sync(q_hi))
            else:
                console.print(
                    "[yellow]Empty highlights search query from LLM; skipping highlights Tavily search.[/yellow]"
                )
            planning_foundation = planning_foundation.model_copy(
                update={
                    "tavily_identity_excerpt": id_excerpt,
                    "tavily_highlights_excerpt": hi_excerpt,
                }
            )
        except Exception as e:
            console.print(f"[yellow]Tavily foundation pipeline failed: {e}[/yellow]")
            planning_foundation = None
    else:
        console.print("[dim]Web search: skipped (set TAVILY_API_KEY in .env to enable).[/dim]")

    console.print("Calling LLM for cut plan…")
    plan = generate_cut_plan(
        doc,
        title=title,
        planning_foundation=planning_foundation,
        verbose=verbose,
        console=console,
    )

    plan_out = plan_out.resolve()
    plan_out.parent.mkdir(parents=True, exist_ok=True)
    plan_out.write_text(plan.model_dump_json(indent=2), encoding="utf-8")
    console.print(
        f"Wrote [green]{plan_out}[/green] "
        f"({len(plan.longform_clips)} long, {len(plan.shortform_clips)} short)"
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


@app.command("ingest")
def cmd_ingest(
    video: Annotated[Path, typer.Argument(help="Input video file.")],
    output_dir: Annotated[
        Optional[Path],
        typer.Option("--output-dir", "-o", help="Directory for transcript.json and audio.wav."),
    ] = None,
    whisper_model: Annotated[
        str,
        typer.Option("--whisper-model", help="faster-whisper model size (tiny, base, small, …)."),
    ] = "base",
    device: Annotated[
        str,
        typer.Option(help="Whisper device: auto (try CUDA, then CPU), cpu, or cuda."),
    ] = "auto",
    compute_type: Annotated[
        str,
        typer.Option(help="faster-whisper compute type (default, int8, float16, …)."),
    ] = "default",
    language: Annotated[
        Optional[str],
        typer.Option(help="Force Whisper language code (e.g. en); default auto."),
    ] = None,
) -> None:
    """Extract 16 kHz mono audio, run local Whisper, write transcript JSON."""
    out = (output_dir or Path("clip_engine_out")).resolve()
    try:
        run_ingest(
            video,
            out,
            whisper_model=whisper_model,
            device=device,
            compute_type=compute_type,
            language=language,
        )
    except FileNotFoundError as e:
        console.print(f"[red]Not a file:[/red] {e}")
        raise typer.Exit(1) from e


@app.command("plan")
def cmd_plan(
    ctx: typer.Context,
    transcript_json: Annotated[Path, typer.Argument(help="Path from `ingest` (transcript.json).")],
    output: Annotated[
        Optional[Path],
        typer.Option("--output", "-o", help="Write cut plan JSON here."),
    ] = None,
    title: Annotated[
        Optional[str],
        typer.Option(help="Series/episode title or context for the LLM."),
    ] = None,
) -> None:
    """Build cut_plan.json via LLM (openai or anthropic). Tavily runs automatically when TAVILY_API_KEY is set."""
    path = transcript_json.resolve()
    if not path.is_file():
        console.print(f"[red]Not found:[/red] {path}")
        raise typer.Exit(1)
    plan_out = (output or path.parent / "cut_plan.json").resolve()
    run_plan(
        path,
        plan_out,
        title=title,
        verbose=_cli_verbose(ctx),
    )


@app.command("render")
def cmd_render(
    cut_plan_json: Annotated[Path, typer.Argument(help="Path to cut_plan.json.")],
    video: Annotated[Path, typer.Argument(help="Source video (same as ingest input).")],
    output_dir: Annotated[
        Optional[Path],
        typer.Option("--output-dir", "-o", help="Output directory for rendered MP4s."),
    ] = None,
    transcript: Annotated[
        Optional[Path],
        typer.Option(
            "--transcript",
            help="transcript.json from ingest (default: beside cut_plan.json). Used to avoid mid-speech cuts.",
        ),
    ] = None,
) -> None:
    """FFmpeg: render longform (landscape) and shortform (vertical) clips."""
    plan_path = cut_plan_json.resolve()
    vid = video.resolve()
    if not plan_path.is_file() or not vid.is_file():
        console.print("[red]cut_plan.json or video not found.[/red]")
        raise typer.Exit(1)
    out = (output_dir or (plan_path.parent / "rendered")).resolve()
    run_render(plan_path, vid, out, transcript_path=transcript)


@app.command("run-all")
def cmd_run_all(
    ctx: typer.Context,
    video: Annotated[Path, typer.Argument(help="Input video file.")],
    output_dir: Annotated[
        Path,
        typer.Option("--output-dir", "-o", help="Working directory for all artifacts."),
    ] = Path("clip_engine_out"),
    title: Annotated[Optional[str], typer.Option(help="Context title for the LLM.")] = None,
    whisper_model: Annotated[str, typer.Option("--whisper-model")] = "base",
    whisper_device: Annotated[
        str,
        typer.Option(
            "--whisper-device",
            help="Whisper device: auto (try CUDA, then CPU), cpu, or cuda.",
        ),
    ] = "auto",
    whisper_compute_type: Annotated[
        str,
        typer.Option(
            "--whisper-compute-type",
            help="faster-whisper compute type (default, int8, float16, float32, …).",
        ),
    ] = "default",
) -> None:
    """ingest, then plan, then render in one directory."""
    output_dir = output_dir.resolve()
    transcript_path = output_dir / "transcript.json"
    plan_path = output_dir / "cut_plan.json"
    rendered_dir = output_dir / "rendered"

    console.print("[bold]--- ingest ---[/bold]")
    run_ingest(
        video,
        output_dir,
        whisper_model=whisper_model,
        device=whisper_device,
        compute_type=whisper_compute_type,
    )

    console.print("[bold]--- plan ---[/bold]")
    run_plan(
        transcript_path,
        plan_path,
        title=title,
        verbose=_cli_verbose(ctx),
    )

    console.print("[bold]--- render ---[/bold]")
    run_render(plan_path, video, rendered_dir, transcript_path=output_dir / "transcript.json")


if __name__ == "__main__":
    app()
