"""FFmpeg: trim, scale, and crop for longform (landscape) and shortform (vertical)."""

from __future__ import annotations

import subprocess
from pathlib import Path

from rich.progress import Progress

from clipengine.config import (
    LONGFORM_MAX_DURATION_S,
    LONGFORM_MIN_DURATION_S,
    SHORTFORM_MAX_DURATION_S,
    SHORTFORM_MIN_DURATION_S,
)
from clipengine.ingest.audio import FFmpegError, ensure_ffmpeg, probe_duration_s
from clipengine.models import ClipItem, CutPlan, TranscriptDoc
from clipengine.plan.snap import snap_clip_to_transcript


def _run_ffmpeg(args: list[str]) -> None:
    proc = subprocess.run(args, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise FFmpegError(proc.stderr.strip() or "ffmpeg failed")


def _vf_square_pixel_then_fit_pad(
    out_w: int,
    out_h: int,
    dar: str,
) -> str:
    """
    1) Expand anamorphic (non-square SAR) sources to square-pixel geometry so
       aspect ratio matches what viewers see.
    2) Scale to fit inside out_w×out_h without cropping (no zoom).
    3) Pad with black to exact output size; tag DAR.
    """
    return (
        "scale=w=iw*sar:h=ih,setsar=1,"
        f"scale={out_w}:{out_h}:force_original_aspect_ratio=decrease:"
        f"flags=bicubic+accurate_rnd:force_divisible_by=2,"
        f"pad={out_w}:{out_h}:(ow-iw)/2:(oh-ih)/2:color=black,"
        f"format=yuv420p,"
        f"setsar=1,setdar={dar}"
    )


def vf_longform(width: int = 1920, height: int = 1080) -> str:
    """
    Force 16:9 output at ``width``×``height``.

    Fits the **entire** decoded picture inside the frame (no center-crop / zoom),
    then pads with black. Handles anamorphic SAR correctly.
    """
    return _vf_square_pixel_then_fit_pad(width, height, "16/9")


# Zoom after fit-in-frame (contain), matching offline verify_916_shortform_zoom_plus20pct.mp4.
_SHORTFORM_ZOOM_AFTER_FIT = 2.34375


def vf_shortform_vertical(width: int = 1080, height: int = 1920) -> str:
    """
    Force **9:16** output at ``width``×``height`` (e.g. 1080×1920).

    Square-pixel SAR, scale to fit inside the frame (letterbox/pillarbox as
    needed), then apply a mild center zoom, crop to the output size, and pad.
    """
    w, h = width, height
    z = _SHORTFORM_ZOOM_AFTER_FIT
    # Commas inside crop=min(...) must be escaped for FFmpeg's filter list parser.
    return (
        "scale=w=iw*sar:h=ih,setsar=1,"
        f"scale={w}:{h}:force_original_aspect_ratio=decrease:"
        f"flags=bicubic+accurate_rnd:force_divisible_by=2,"
        f"scale=iw*{z}:ih*{z}:flags=lanczos,"
        f"crop=min(iw\\,{w}):min(ih\\,{h}),"
        f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black,"
        f"format=yuv420p,"
        f"setsar=1,setdar=9/16"
    )


def render_clip(
    video: Path,
    clip: ClipItem,
    out_path: Path,
    *,
    vf: str,
    video_codec: str = "libx264",
    audio_codec: str = "aac",
    crf: int = 20,
    preset: str = "fast",
) -> None:
    """Extract [start_s, end_s] and apply video filter."""
    ffmpeg = ensure_ffmpeg()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    duration = max(0.01, clip.end_s - clip.start_s)
    cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{clip.start_s:.3f}",
        "-i",
        str(video),
        "-t",
        f"{duration:.3f}",
        "-vf",
        vf,
        "-c:v",
        video_codec,
        "-preset",
        preset,
        "-crf",
        str(crf),
        "-c:a",
        audio_codec,
        "-movflags",
        "+faststart",
        str(out_path),
    ]
    _run_ffmpeg(cmd)


def render_plan(
    video: Path,
    plan: CutPlan,
    output_dir: Path,
    *,
    transcript_doc: TranscriptDoc | None = None,
    longform_size: tuple[int, int] = (1920, 1080),
    shortform_size: tuple[int, int] = (1080, 1920),
) -> list[Path]:
    """
    Write longform/* and shortform/* under output_dir; return written paths.

    If ``transcript_doc`` is set (same JSON as ``ingest``), clip times are snapped to
    Whisper segment boundaries so trims do not fall mid-utterance. Duration may drift a
    few seconds vs the plan; see ``clipengine_SNAP_DURATION_SLACK_S`` in ``plan.snap``.
    """
    output_dir = output_dir.resolve()
    video = video.resolve()
    long_dir = output_dir / "longform"
    short_dir = output_dir / "shortform"
    long_dir.mkdir(parents=True, exist_ok=True)
    short_dir.mkdir(parents=True, exist_ok=True)

    video_dur = probe_duration_s(video)

    lw, lh = longform_size
    sw, sh = shortform_size
    vf_long = vf_longform(lw, lh)
    vf_short = vf_shortform_vertical(sw, sh)

    written: list[Path] = []
    with Progress() as progress:
        task = progress.add_task("Rendering clips…", total=len(plan.longform_clips) + len(plan.shortform_clips))

        for i, clip in enumerate(plan.longform_clips, start=1):
            safe = _safe_filename(clip.title, i, "long")
            out = long_dir / f"{safe}.mp4"
            use = clip
            if transcript_doc is not None:
                use = snap_clip_to_transcript(
                    clip,
                    transcript_doc,
                    min_duration_s=LONGFORM_MIN_DURATION_S,
                    max_duration_s=LONGFORM_MAX_DURATION_S,
                    video_duration_s=video_dur,
                )
            render_clip(video, use, out, vf=vf_long)
            written.append(out)
            progress.advance(task)

        for i, clip in enumerate(plan.shortform_clips, start=1):
            safe = _safe_filename(clip.title, i, "short")
            out = short_dir / f"{safe}.mp4"
            use = clip
            if transcript_doc is not None:
                use = snap_clip_to_transcript(
                    clip,
                    transcript_doc,
                    min_duration_s=SHORTFORM_MIN_DURATION_S,
                    max_duration_s=SHORTFORM_MAX_DURATION_S,
                    video_duration_s=video_dur,
                )
            render_clip(video, use, out, vf=vf_short)
            written.append(out)
            progress.advance(task)

    return written


def _safe_filename(title: str, index: int, prefix: str) -> str:
    base = title.strip() or f"{prefix}_{index}"
    for ch in '<>:"/\\|?*':
        base = base.replace(ch, "_")
    base = base.strip()[:80] or f"{prefix}_{index}"
    return f"{index:02d}_{base}"
