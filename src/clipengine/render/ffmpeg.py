"""FFmpeg: trim, scale, and crop for longform (landscape) and shortform (vertical)."""

from __future__ import annotations

import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from rich.progress import Progress

from clipengine.config import (
    longform_max_duration_s,
    longform_min_duration_s,
    shortform_max_duration_s,
    shortform_min_duration_s,
)
from clipengine.ingest.audio import FFmpegError, ensure_ffmpeg, probe_duration_s
from clipengine.models import ClipItem, CutPlan, TranscriptDoc
from clipengine.plan.snap import snap_clip_to_transcript


def _run_ffmpeg(args: list[str]) -> None:
    proc = subprocess.run(args, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise FFmpegError(proc.stderr.strip() or "ffmpeg failed")


def _write_render_activity_json(
    path: Path | None,
    *,
    phase: str,
    current: int,
    total: int,
    kind: str,
    title: str,
) -> None:
    """Structured render progress for the web UI (polled via ``render_activity.json``)."""
    if path is None:
        return
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "phase": phase,
        "current": current,
        "total": total,
        "kind": kind,
        "updatedAt": now.isoformat().replace("+00:00", "Z"),
        "updatedAtMs": int(now.timestamp() * 1000),
    }
    t = title.strip()
    if t:
        payload["title"] = t[:200]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


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


_CROP_DETECT_RE = re.compile(r"crop=(\d+):(\d+):(\d+):(\d+)")


def _cropdetect_params(mp4_path: Path, *, offset_s: float) -> tuple[int, int, int, int] | None:
    """
    Run cropdetect on a short segment after *offset_s* and return the last w:h:x:y, or
    None if FFmpeg fails or no crop line is found.
    """
    ffmpeg = ensure_ffmpeg()
    dur = probe_duration_s(mp4_path)
    t = min(max(0.05, offset_s), max(0.05, dur - 0.05))
    cmd = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "info",
        "-ss",
        f"{t:.3f}",
        "-i",
        str(mp4_path),
        "-vf",
        "cropdetect=24:16:0",
        "-frames:v",
        "30",
        "-f",
        "null",
        "-",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        return None
    matches = _CROP_DETECT_RE.findall(proc.stderr)
    if not matches:
        return None
    w, h, x, y = (int(v) for v in matches[-1])
    if w <= 0 or h <= 0:
        return None
    return (w, h, x, y)


def extract_clip_thumbnail(
    mp4_path: Path,
    out_jpg: Path,
    *,
    offset_s: float = 0.5,
    remove_black_padding: bool = False,
) -> None:
    """
    Write a single JPEG frame from *mp4_path* (typically a rendered clip).

    Seeks slightly after the start to avoid a black or transition frame on short outputs.

    When *remove_black_padding* is True (shortform letterboxed 9:16), FFmpeg *cropdetect*
    finds non-black bounds and the JPEG is cropped to that rectangle so thumbnails do not
    show pillarbox/letterbox bars. If detection fails, a full-frame grab is used.
    """
    ffmpeg = ensure_ffmpeg()
    out_jpg.parent.mkdir(parents=True, exist_ok=True)
    dur = probe_duration_s(mp4_path)
    t = min(max(0.05, offset_s), max(0.05, dur - 0.05))
    vf: str | None = None
    if remove_black_padding:
        crop = _cropdetect_params(mp4_path, offset_s=offset_s)
        if crop is not None:
            w, h, x, y = crop
            vf = f"crop={w}:{h}:{x}:{y}"
    cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{t:.3f}",
        "-i",
        str(mp4_path),
    ]
    if vf is not None:
        cmd.extend(["-vf", vf])
    cmd.extend(
        [
            "-frames:v",
            "1",
            "-q:v",
            "2",
            str(out_jpg),
        ]
    )
    _run_ffmpeg(cmd)


def render_clip(
    video: Path,
    clip: ClipItem,
    out_path: Path,
    *,
    vf: str,
    audio_stream_index: int = 0,
    video_codec: str = "libx264",
    audio_codec: str = "aac",
    crf: int = 20,
    preset: str = "fast",
) -> None:
    """Extract [start_s, end_s] and apply video filter."""
    if audio_stream_index < 0:
        raise ValueError("audio_stream_index must be non-negative")
    ffmpeg = ensure_ffmpeg()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    duration = max(0.01, clip.end_s - clip.start_s)
    # Seek *after* -i (decode-time seek). Input seeking (-ss before -i) is faster but can
    # drop or silence non-default audio on some MKV / multi-track sources.
    cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(video),
        "-ss",
        f"{clip.start_s:.3f}",
        "-t",
        f"{duration:.3f}",
        "-map",
        "0:v:0",
        "-map",
        f"0:a:{audio_stream_index}",
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
    audio_stream_index: int = 0,
    longform_size: tuple[int, int] = (1920, 1080),
    shortform_size: tuple[int, int] = (1080, 1920),
    render_activity_path: Path | None = None,
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

    lw, lh = longform_size
    sw, sh = shortform_size
    vf_long = vf_longform(lw, lh)
    vf_short = vf_shortform_vertical(sw, sh)

    written: list[Path] = []
    total_clips = len(plan.longform_clips) + len(plan.shortform_clips)
    _write_render_activity_json(
        render_activity_path,
        phase="render_start",
        current=0,
        total=total_clips,
        kind="",
        title="Probing source duration (large files can take a minute)…",
    )
    video_dur = probe_duration_s(video)
    _write_render_activity_json(
        render_activity_path,
        phase="render_start",
        current=0,
        total=total_clips,
        kind="",
        title="Preparing clip encodes…",
    )
    clip_seq = 0
    with Progress() as progress:
        task = progress.add_task("Rendering clips…", total=total_clips)

        for i, clip in enumerate(plan.longform_clips, start=1):
            clip_seq += 1
            safe = _safe_filename(clip.title, i, "long")
            out = long_dir / f"{safe}.mp4"
            _write_render_activity_json(
                render_activity_path,
                phase="render_clip",
                current=clip_seq,
                total=total_clips,
                kind="longform",
                title=clip.title,
            )
            use = clip
            if transcript_doc is not None:
                use = snap_clip_to_transcript(
                    clip,
                    transcript_doc,
                    min_duration_s=longform_min_duration_s(),
                    max_duration_s=longform_max_duration_s(),
                    video_duration_s=video_dur,
                )
            render_clip(video, use, out, vf=vf_long, audio_stream_index=audio_stream_index)
            extract_clip_thumbnail(out, out.with_suffix(".jpg"))
            written.append(out)
            progress.advance(task)

        for i, clip in enumerate(plan.shortform_clips, start=1):
            clip_seq += 1
            safe = _safe_filename(clip.title, i, "short")
            out = short_dir / f"{safe}.mp4"
            _write_render_activity_json(
                render_activity_path,
                phase="render_clip",
                current=clip_seq,
                total=total_clips,
                kind="shortform",
                title=clip.title,
            )
            use = clip
            if transcript_doc is not None:
                use = snap_clip_to_transcript(
                    clip,
                    transcript_doc,
                    min_duration_s=shortform_min_duration_s(),
                    max_duration_s=shortform_max_duration_s(),
                    video_duration_s=video_dur,
                )
            render_clip(video, use, out, vf=vf_short, audio_stream_index=audio_stream_index)
            extract_clip_thumbnail(out, out.with_suffix(".jpg"), remove_black_padding=True)
            written.append(out)
            progress.advance(task)

    _write_render_activity_json(
        render_activity_path,
        phase="render_complete",
        current=total_clips,
        total=total_clips,
        kind="",
        title="",
    )

    return written


def _safe_filename(title: str, index: int, prefix: str) -> str:
    base = title.strip() or f"{prefix}_{index}"
    for ch in '<>:"/\\|?*':
        base = base.replace(ch, "_")
    base = base.strip()[:80] or f"{prefix}_{index}"
    return f"{index:02d}_{base}"
