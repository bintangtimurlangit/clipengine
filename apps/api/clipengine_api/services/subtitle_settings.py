"""Map SQLite settings JSON to :class:`clipengine.render.subtitles.SubtitleRenderConfig`."""

from __future__ import annotations

from typing import Any, cast

from clipengine.render.subtitles import AlignmentName, SubtitleRenderConfig, SubtitleStyle

SUBTITLE_ALIGNMENTS = frozenset(
    {
        "bottom_left",
        "bottom_center",
        "bottom_right",
        "middle_left",
        "middle_center",
        "middle_right",
        "top_left",
        "top_center",
        "top_right",
    }
)


def subtitle_render_config_from_stored(stored: dict[str, Any]) -> SubtitleRenderConfig:
    """Build render config from ``llm_settings_json`` keys (``subtitles_*``)."""
    enabled = stored.get("subtitles_enabled") is True
    align = str(stored.get("subtitles_alignment") or "bottom_center").strip()
    if align not in SUBTITLE_ALIGNMENTS:
        align = "bottom_center"
    ff = str(stored.get("subtitles_font_family") or "DejaVu Sans").strip() or "DejaVu Sans"
    try:
        fs = int(stored.get("subtitles_font_size") or 48)
    except (TypeError, ValueError):
        fs = 48
    fs = max(8, min(200, fs))
    primary = str(stored.get("subtitles_primary_color") or "#FFFFFF").strip() or "#FFFFFF"
    outline_c = str(stored.get("subtitles_outline_color") or "#000000").strip() or "#000000"
    try:
        ow = int(stored.get("subtitles_outline_width") or 3)
    except (TypeError, ValueError):
        ow = 3
    ow = max(0, min(20, ow))
    try:
        mv = int(stored.get("subtitles_margin_v") or 48)
    except (TypeError, ValueError):
        mv = 48
    mv = max(0, min(400, mv))
    try:
        ml = int(stored.get("subtitles_max_lines") or 2)
    except (TypeError, ValueError):
        ml = 2
    ml = max(1, min(8, ml))
    style = SubtitleStyle(
        font_family=ff,
        font_size=fs,
        primary_color=primary,
        outline_color=outline_c,
        outline_width=ow,
        margin_v=mv,
        alignment=cast(AlignmentName, align),
        max_lines=ml,
    )
    return SubtitleRenderConfig(enabled=enabled, style=style)
