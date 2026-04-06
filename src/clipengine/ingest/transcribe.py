"""Local Whisper transcription via faster-whisper (CUDA with automatic CPU fallback)."""

from __future__ import annotations

from pathlib import Path

from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

from clipengine.ingest.audio import probe_duration_s
from clipengine.models import TranscriptDoc, TranscriptSegment

_err = Console(stderr=True)


def _cpu_compute_type(compute_type: str) -> str:
    """float16 is often invalid on CPU; use default so faster-whisper picks a safe type."""
    if compute_type.lower() == "float16":
        return "default"
    return compute_type


def _should_fallback_cuda_to_cpu(exc: BaseException) -> bool:
    msg = f"{type(exc).__name__}: {exc}".lower()
    markers = (
        "cublas",
        "cudnn",
        "cuda",
        "nvrtc",
        "nvidia",
        "no cuda",
        "not compiled with cuda",
        "cannot load",
        "failed to load",
    )
    return any(m in msg for m in markers)


def _attempts(device: str, compute_type: str) -> list[tuple[str, str]]:
    if device != "auto":
        return [(device, compute_type)]
    return [
        ("cuda", compute_type),
        ("cpu", _cpu_compute_type(compute_type)),
    ]


def _transcribe_once(
    wav_path: Path,
    *,
    source_video: Path,
    model_size: str,
    device: str,
    compute_type: str,
    language: str | None,
) -> TranscriptDoc:
    from faster_whisper import WhisperModel

    duration_s = probe_duration_s(source_video)

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        transient=True,
    ) as progress:
        progress.add_task(description=f"Loading Whisper model {model_size!r} ({device})…", total=None)
        wmodel = WhisperModel(model_size, device=device, compute_type=compute_type)

    segments_out: list[TranscriptSegment] = []
    info_lang: str | None = None

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        transient=True,
    ) as progress:
        task = progress.add_task(description="Transcribing…", total=None)
        segments_iter, info = wmodel.transcribe(
            str(wav_path),
            language=language,
            vad_filter=True,
        )
        info_lang = info.language
        for seg in segments_iter:
            segments_out.append(
                TranscriptSegment(start=seg.start, end=seg.end, text=(seg.text or "").strip())
            )
        progress.update(task, completed=True)

    return TranscriptDoc(
        source_video=str(source_video.resolve()),
        duration_s=duration_s,
        language=info_lang,
        segments=segments_out,
        whisper_model=model_size,
    )


def transcribe_wav(
    wav_path: Path,
    *,
    source_video: Path,
    model_size: str = "base",
    device: str = "auto",
    compute_type: str = "default",
    language: str | None = None,
) -> TranscriptDoc:
    """
    Transcribe with faster-whisper.

    When ``device`` is ``"auto"``, tries CUDA first, then falls back to CPU if CUDA
    cannot be used (missing DLLs, broken toolkit, etc.).
    """
    attempts = _attempts(device, compute_type)

    for idx, (dev, ct) in enumerate(attempts):
        try:
            return _transcribe_once(
                wav_path,
                source_video=source_video,
                model_size=model_size,
                device=dev,
                compute_type=ct,
                language=language,
            )
        except (RuntimeError, OSError) as e:
            is_last = idx == len(attempts) - 1
            if is_last:
                raise
            if device != "auto" or dev != "cuda":
                raise
            if not _should_fallback_cuda_to_cpu(e):
                raise
            _err.print("[yellow]Whisper: CUDA unavailable; continuing on CPU.[/yellow]")
            continue


# ---------------------------------------------------------------------------
# WebVTT export
# ---------------------------------------------------------------------------


def _fmt_vtt_time(seconds: float) -> str:
    if seconds < 0:
        seconds = 0.0
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",")


def transcript_to_vtt(doc: TranscriptDoc) -> str:
    """Convert a :class:`TranscriptDoc` to a WebVTT string."""
    lines = ["WEBVTT", ""]
    for i, seg in enumerate(doc.segments, start=1):
        t0 = _fmt_vtt_time(seg.start)
        t1 = _fmt_vtt_time(seg.end)
        lines.append(str(i))
        lines.append(f"{t0} --> {t1}")
        lines.append(seg.text or "")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"
