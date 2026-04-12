"""Burn-in subtitles: clip transcript segments to ASS and FFmpeg ``subtitles`` filter."""

from __future__ import annotations

import os
import re
import tempfile
import textwrap
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from clipengine.models import TranscriptDoc

AlignmentName = Literal[
    "bottom_left",
    "bottom_center",
    "bottom_right",
    "middle_left",
    "middle_center",
    "middle_right",
    "top_left",
    "top_center",
    "top_right",
]

# ASS numpad alignment (1–9).
_ALIGNMENT_TO_ASS = {
    "bottom_left": 1,
    "bottom_center": 2,
    "bottom_right": 3,
    "middle_left": 4,
    "middle_center": 5,
    "middle_right": 6,
    "top_left": 7,
    "top_center": 8,
    "top_right": 9,
}


class SubtitleStyle(BaseModel):
    """Style for burned-in ASS subtitles (PlayRes matches output frame)."""

    font_family: str = Field(default="DejaVu Sans", description="Font family (Fontconfig)")
    font_size: int = Field(default=48, ge=8, le=200, description="Font size in pixels")
    primary_color: str = Field(
        default="#FFFFFF",
        description="Text color #RRGGBB or #RRGGBBAA",
    )
    outline_color: str = Field(default="#000000", description="Outline color #RRGGBB")
    outline_width: int = Field(default=3, ge=0, le=20)
    margin_v: int = Field(default=48, ge=0, le=400, description="Vertical margin (pixels)")
    alignment: AlignmentName = Field(default="bottom_center")
    max_lines: int = Field(default=2, ge=1, le=8)


class SubtitleRenderConfig(BaseModel):
    """When enabled, burn transcript into each rendered clip."""

    enabled: bool = False
    style: SubtitleStyle = Field(default_factory=SubtitleStyle)


def _hex_to_ass_bgr(hex_color: str, *, default_alpha: str = "00") -> str:
    """ASS PrimaryColour: &HAABBGGRR."""
    s = (hex_color or "").strip().lstrip("#")
    if len(s) == 6:
        rr, gg, bb = s[0:2], s[2:4], s[4:6]
        aa = default_alpha
    elif len(s) == 8:
        rr, gg, bb, aa = s[0:2], s[2:4], s[4:6], s[6:8]
    else:
        return "&H00FFFFFF"
    try:
        int(aa, 16)
        int(rr, 16)
        int(gg, 16)
        int(bb, 16)
    except ValueError:
        return "&H00FFFFFF"
    return f"&H{aa}{bb}{gg}{rr}"


def _escape_ass_body(text: str) -> str:
    """Escape user text for ASS dialogue body."""
    t = text.replace("\\", "\\\\")
    t = t.replace("{", "\\{").replace("}", "\\}")
    t = re.sub(r"\r\n|\r|\n", r"\\N", t)
    return t


def _ass_timestamp(seconds: float) -> str:
    if seconds < 0:
        seconds = 0.0
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h:d}:{m:02d}:{s:05.2f}"


def segments_for_clip_window(
    doc: TranscriptDoc,
    clip_start: float,
    clip_end: float,
) -> list[tuple[float, float, str]]:
    """Return (relative_start, relative_end, text) for segments overlapping [clip_start, clip_end]."""
    out: list[tuple[float, float, str]] = []
    win0 = float(clip_start)
    win1 = float(clip_end)
    if win1 <= win0:
        return out
    for seg in doc.segments:
        s = float(seg.start)
        e = float(seg.end)
        if e <= win0 or s >= win1:
            continue
        t0 = max(s, win0) - win0
        t1 = min(e, win1) - win0
        txt = (seg.text or "").strip()
        if t1 > t0 and txt:
            out.append((t0, t1, txt))
    return out


def build_ass_for_clip(
    doc: TranscriptDoc,
    clip_start: float,
    clip_end: float,
    width: int,
    height: int,
    style: SubtitleStyle,
) -> str:
    """Build ASS file content for one clip window (times relative to clip start)."""
    play_x = max(16, int(width))
    play_y = max(16, int(height))
    align = _ALIGNATION_TO_ASS.get(style.alignment, 2)
    primary = _hex_to_ass_bgr(style.primary_color)
    outline_c = _hex_to_ass_bgr(style.outline_color)
    # BackColour with slight transparency for optional box; BorderStyle 1 = outline only.
    back = "&H80000000"

    lines: list[str] = [
        "[Script Info]",
        "Title: clip",
        "ScriptType: v4.00+",
        f"PlayResX: {play_x}",
        f"PlayResY: {play_y}",
        "WrapStyle: 0",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        (
            f"Style: Default,{style.font_family},{style.font_size},{primary},"
            f"&H000000FF,{outline_c},{back},0,0,0,0,100,100,0,0,1,{style.outline_width},0,"
            f"{align},20,20,{style.margin_v},1"
        ),
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    segs = segments_for_clip_window(doc, clip_start, clip_end)
    width_chars = max(20, min(80, play_x // max(style.font_size // 2, 12)))
    for t0, t1, text in segs:
        raw_lines = textwrap.wrap(text, width=width_chars) or [text]
        if style.max_lines > 0:
            raw_lines = raw_lines[: style.max_lines]
        body = "\\N".join(_escape_ass_body(line) for line in raw_lines)
        if not body.strip():
            continue
        # \\anX reinforces alignment per line when needed
        an_tag = f"{{\\an{align}}}"
        start = _ass_timestamp(t0)
        end = _ass_timestamp(t1)
        lines.append(f"Dialogue: 0,{start},{end},Default,,0,0,0,,{an_tag}{body}")

    return "\n".join(lines) + "\n"


def subtitles_vf_arg(ass_path: Path) -> str:
    """Single ``subtitles=...`` filter argument, escaped for FFmpeg ``-vf`` filtergraphs."""
    resolved = ass_path.resolve()
    if os.name == "nt":
        p = str(resolved)
        p = p.replace("\\", "/")
    else:
        p = resolved.as_posix()
    # Escape filter-special characters (see ffmpeg filters documentation).
    p = p.replace("\\", "\\\\")
    p = p.replace(":", "\\:")
    p = p.replace("'", "\\'")
    return f"subtitles='{p}'"


def compose_vf_with_subtitles(base_vf: str, ass_path: Path) -> str:
    """Append burn-in subtitles after geometry filters."""
    sub = subtitles_vf_arg(ass_path)
    if not base_vf.strip():
        return sub
    return f"{base_vf},{sub}"


def write_temp_ass(ass_content: str) -> Path:
    """Write ASS content to a temporary file; caller must unlink when done."""
    fd, path = tempfile.mkstemp(prefix="ce_sub_", suffix=".ass", text=False)
    os.close(fd)
    p = Path(path)
    p.write_text(ass_content, encoding="utf-8")
    return p
