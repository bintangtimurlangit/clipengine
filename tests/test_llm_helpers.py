"""Tests for clipengine.plan.llm pure-Python helpers (no LLM calls)."""

from __future__ import annotations

import json
import os

import pytest

from clipengine.models import ClipItem, CutPlan, TranscriptDoc, TranscriptSegment
from clipengine.plan.llm import (
    _extract_json_object,
    _get_llm_provider,
    _truncate_middle,
    format_transcript_for_prompt,
    plan_from_json_file,
    sanitize_cut_plan,
    sanitize_cut_plan_with_report,
)


# ---------------------------------------------------------------------------
# _truncate_middle
# ---------------------------------------------------------------------------


def test_truncate_middle_short_text_unchanged() -> None:
    text = "hello world"
    assert _truncate_middle(text, max_chars=100) == text


def test_truncate_middle_exact_length_unchanged() -> None:
    text = "a" * 50
    assert _truncate_middle(text, max_chars=50) == text


def test_truncate_middle_long_text_truncated() -> None:
    text = "A" * 200
    result = _truncate_middle(text, max_chars=100)
    assert len(result) <= 120  # some overhead from the ellipsis message
    assert "truncated" in result


# ---------------------------------------------------------------------------
# format_transcript_for_prompt
# ---------------------------------------------------------------------------


def _make_doc(n_segs: int = 5, text_per_seg: str = "word") -> TranscriptDoc:
    segs = [
        TranscriptSegment(start=float(i * 10), end=float(i * 10 + 9), text=text_per_seg)
        for i in range(n_segs)
    ]
    return TranscriptDoc(source_video="v.mp4", duration_s=float(n_segs * 10), segments=segs)


def test_format_transcript_includes_timestamps() -> None:
    doc = _make_doc(3)
    out = format_transcript_for_prompt(doc)
    assert "0.00s" in out
    assert "10.00s" in out


def test_format_transcript_truncates_when_too_long() -> None:
    # Make each segment very long so total > max_chars
    long_text = "x" * 10_000
    segs = [
        TranscriptSegment(start=float(i * 10), end=float(i * 10 + 9), text=long_text)
        for i in range(30)
    ]
    doc = TranscriptDoc(source_video="v.mp4", duration_s=300.0, segments=segs)
    out = format_transcript_for_prompt(doc, max_chars=50_000)
    assert len(out) <= 50_200  # small overhead
    assert "omitted" in out


def test_format_transcript_empty_segments() -> None:
    doc = TranscriptDoc(source_video="v.mp4", duration_s=0.0)
    assert format_transcript_for_prompt(doc) == ""


# ---------------------------------------------------------------------------
# _extract_json_object
# ---------------------------------------------------------------------------


def test_extract_json_object_plain_json() -> None:
    data = {"longform_clips": [], "shortform_clips": []}
    raw = json.dumps(data)
    assert _extract_json_object(raw) == data


def test_extract_json_object_with_preamble() -> None:
    raw = "Here is the JSON:\n\n" + json.dumps({"a": 1})
    assert _extract_json_object(raw) == {"a": 1}


def test_extract_json_object_raises_on_no_json() -> None:
    with pytest.raises(ValueError, match="valid JSON"):
        _extract_json_object("no json here at all")


def test_extract_json_object_multiline_json() -> None:
    raw = """Some text before
{
  "clips": [1, 2, 3]
}"""
    result = _extract_json_object(raw)
    assert result == {"clips": [1, 2, 3]}


# ---------------------------------------------------------------------------
# _get_llm_provider
# ---------------------------------------------------------------------------


def test_get_llm_provider_defaults_to_openai(monkeypatch) -> None:
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    assert _get_llm_provider() == "openai"


def test_get_llm_provider_anthropic(monkeypatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    assert _get_llm_provider() == "anthropic"


def test_get_llm_provider_claude_alias(monkeypatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "claude")
    assert _get_llm_provider() == "anthropic"


def test_get_llm_provider_oai_alias(monkeypatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "oai")
    assert _get_llm_provider() == "openai"


def test_get_llm_provider_invalid_raises(monkeypatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    with pytest.raises(ValueError):
        _get_llm_provider()


# ---------------------------------------------------------------------------
# sanitize_cut_plan / sanitize_cut_plan_with_report
# ---------------------------------------------------------------------------

# Video is 600 s; longform min=180, max=360; shortform min=27, max=80 (defaults)


def _longform(start: float, end: float, title: str = "") -> ClipItem:
    return ClipItem(start_s=start, end_s=end, title=title)


def _shortform(start: float, end: float, title: str = "") -> ClipItem:
    return ClipItem(start_s=start, end_s=end, title=title)


VIDEO_DUR = 600.0


def test_sanitize_keeps_valid_longform() -> None:
    plan = CutPlan(longform_clips=[_longform(0, 200)])
    out = sanitize_cut_plan(plan, VIDEO_DUR)
    assert len(out.longform_clips) == 1
    assert out.longform_clips[0].start_s == 0.0
    assert out.longform_clips[0].end_s == 200.0


def test_sanitize_keeps_valid_shortform() -> None:
    plan = CutPlan(shortform_clips=[_shortform(10, 50)])
    out = sanitize_cut_plan(plan, VIDEO_DUR)
    assert len(out.shortform_clips) == 1


def test_sanitize_drops_inverted_clip() -> None:
    plan = CutPlan(longform_clips=[_longform(100, 50)])
    out = sanitize_cut_plan(plan, VIDEO_DUR)
    assert out.longform_clips == []


def test_sanitize_drops_clip_with_equal_start_end() -> None:
    plan = CutPlan(longform_clips=[_longform(50, 50)])
    out = sanitize_cut_plan(plan, VIDEO_DUR)
    assert out.longform_clips == []


def test_sanitize_clamps_clip_beyond_duration() -> None:
    plan = CutPlan(longform_clips=[_longform(0, 700)])
    out = sanitize_cut_plan(plan, VIDEO_DUR)
    # end clamped to 600; duration=600 which is > max 360 → dropped
    assert out.longform_clips == []


def _reload_llm_mod(monkeypatch, **env_overrides):
    """Reload clipengine.config + clipengine.plan.llm after setting env vars."""
    import importlib
    import sys

    for k, v in env_overrides.items():
        monkeypatch.setenv(k, v)
    for mod in ("clipengine.config", "clipengine.plan.llm"):
        sys.modules.pop(mod, None)
    import clipengine.plan.llm as llm_mod
    importlib.reload(llm_mod)
    return llm_mod


def test_sanitize_drops_longform_too_short(monkeypatch) -> None:
    llm_mod = _reload_llm_mod(monkeypatch, clipengine_LONGFORM_MIN_S="180")
    plan = CutPlan(longform_clips=[_longform(0, 100)])
    out = llm_mod.sanitize_cut_plan(plan, VIDEO_DUR)
    assert out.longform_clips == []


def test_sanitize_drops_longform_too_long(monkeypatch) -> None:
    llm_mod = _reload_llm_mod(monkeypatch, clipengine_LONGFORM_MAX_S="360")
    plan = CutPlan(longform_clips=[_longform(0, 400)])
    out = llm_mod.sanitize_cut_plan(plan, VIDEO_DUR)
    assert out.longform_clips == []


def test_sanitize_drops_shortform_too_short(monkeypatch) -> None:
    llm_mod = _reload_llm_mod(monkeypatch, clipengine_SHORTFORM_MIN_S="27")
    plan = CutPlan(shortform_clips=[_shortform(0, 10)])
    out = llm_mod.sanitize_cut_plan(plan, VIDEO_DUR)
    assert out.shortform_clips == []


def test_sanitize_drops_shortform_too_long(monkeypatch) -> None:
    llm_mod = _reload_llm_mod(monkeypatch, clipengine_SHORTFORM_MAX_S="80")
    plan = CutPlan(shortform_clips=[_shortform(0, 100)])
    out = llm_mod.sanitize_cut_plan(plan, VIDEO_DUR)
    assert out.shortform_clips == []


def test_sanitize_report_counts_drops() -> None:
    plan = CutPlan(
        longform_clips=[
            _longform(0, 200, "valid"),
            _longform(50, 50, "zero dur"),  # dropped
        ],
        shortform_clips=[
            _shortform(0, 10, "too short"),  # dropped
            _shortform(10, 50, "ok"),
        ],
    )
    out, report = sanitize_cut_plan_with_report(plan, VIDEO_DUR)
    assert report.longform_in == 2
    assert report.shortform_in == 2
    assert report.longform_out == 1
    assert report.shortform_out == 1
    assert len(report.drops) == 2


def test_sanitize_preserves_notes_and_summary() -> None:
    plan = CutPlan(
        longform_clips=[_longform(0, 200)],
        notes="my notes",
        editorial_summary="editorial",
    )
    out = sanitize_cut_plan(plan, VIDEO_DUR)
    assert out.notes == "my notes"
    assert out.editorial_summary == "editorial"


def test_sanitize_clips_sub_second_after_clamp_dropped() -> None:
    """A clip that becomes <1s after clamping should be dropped."""
    plan = CutPlan(longform_clips=[_longform(599.5, 601.0)])
    out = sanitize_cut_plan(plan, VIDEO_DUR)
    assert out.longform_clips == []


# ---------------------------------------------------------------------------
# plan_from_json_file
# ---------------------------------------------------------------------------


def test_plan_from_json_file(tmp_path) -> None:
    plan = CutPlan(
        longform_clips=[_longform(0, 200, "Scene")],
        shortform_clips=[_shortform(30, 60, "Hook")],
    )
    p = tmp_path / "plan.json"
    p.write_text(plan.model_dump_json(), encoding="utf-8")
    loaded = plan_from_json_file(str(p))
    assert len(loaded.longform_clips) == 1
    assert loaded.longform_clips[0].title == "Scene"
    assert len(loaded.shortform_clips) == 1


def test_plan_from_json_file_missing_raises(tmp_path) -> None:
    with pytest.raises(FileNotFoundError):
        plan_from_json_file(str(tmp_path / "nonexistent.json"))
