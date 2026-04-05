"""WebVTT export for transcript segments."""

from __future__ import annotations

from clip_engine.models import TranscriptDoc


def transcript_to_vtt(doc: TranscriptDoc) -> str:
    lines = ["WEBVTT", ""]
    for i, seg in enumerate(doc.segments, start=1):
        t0 = _fmt_vtt_time(seg.start)
        t1 = _fmt_vtt_time(seg.end)
        lines.append(str(i))
        lines.append(f"{t0} --> {t1}")
        lines.append(seg.text or "")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _fmt_vtt_time(seconds: float) -> str:
    if seconds < 0:
        seconds = 0.0
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",")
