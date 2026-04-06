"""Resolve publish title and description from cut-plan clips + stored settings."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Literal

from clipengine.models import ClipItem, CutPlan

from clipengine_api.core import db

# YouTube Data API limits (conservative)
MAX_TITLE_LEN = 95
MAX_DESCRIPTION_LEN = 5000

PublishTitleSource = Literal["ai_clip", "run_filename"]
PublishDescriptionMode = Literal["full_ai", "manual", "hybrid"]


def default_publish_settings() -> dict[str, Any]:
    return {
        "publish_title_source": "ai_clip",
        "publish_description_mode": "hybrid",
        "publish_description_prefix": "",
        "publish_description_suffix": "",
        "publish_hybrid_include_ai": True,
    }


def load_publish_settings() -> dict[str, Any]:
    raw = db.get_llm_settings_json()
    if not raw or not str(raw).strip():
        return default_publish_settings()
    try:
        stored = json.loads(raw)
    except json.JSONDecodeError:
        return default_publish_settings()
    if not isinstance(stored, dict):
        return default_publish_settings()
    return merge_publish_from_stored(stored)


def merge_publish_from_stored(stored: dict[str, Any]) -> dict[str, Any]:
    out = default_publish_settings()
    src = stored.get("publish_title_source")
    if isinstance(src, str) and src in ("ai_clip", "run_filename"):
        out["publish_title_source"] = src
    mode = stored.get("publish_description_mode")
    if isinstance(mode, str) and mode in ("full_ai", "manual", "hybrid"):
        out["publish_description_mode"] = mode
    pre = stored.get("publish_description_prefix")
    if isinstance(pre, str):
        out["publish_description_prefix"] = pre
    suf = stored.get("publish_description_suffix")
    if isinstance(suf, str):
        out["publish_description_suffix"] = suf
    inc = stored.get("publish_hybrid_include_ai")
    if isinstance(inc, bool):
        out["publish_hybrid_include_ai"] = inc
    return out


def sanitize_title(s: str, max_len: int = MAX_TITLE_LEN) -> str:
    s = re.sub(r'[<>"]', "", s)
    s = s.strip() or "Clip"
    return s[:max_len]


def sanitize_description(s: str, max_len: int = MAX_DESCRIPTION_LEN) -> str:
    s = s.strip()
    return s[:max_len]


def resolve_publish_title(
    clip: ClipItem,
    *,
    run_title: str | None,
    artifact_rel: str | None,
    publish_title_source: PublishTitleSource,
) -> str:
    if publish_title_source == "ai_clip":
        t = (clip.title or "").strip()
        if t:
            return sanitize_title(t)
    stem = Path(artifact_rel or "clip.mp4").stem
    base = (run_title or "").strip() or "Clip Engine"
    return sanitize_title(f"{base} — {stem}")


def resolve_publish_description(
    clip: ClipItem,
    *,
    publish_description_mode: PublishDescriptionMode,
    publish_description_prefix: str,
    publish_description_suffix: str,
    publish_hybrid_include_ai: bool,
) -> str:
    ai = sanitize_description(clip.publish_description or "")
    pre = (publish_description_prefix or "").strip()
    suf = (publish_description_suffix or "").strip()

    if publish_description_mode == "full_ai":
        return ai

    if publish_description_mode == "manual":
        parts = [x for x in (pre, suf) if x]
        return sanitize_description("\n\n".join(parts))

    # hybrid
    parts: list[str] = []
    if pre:
        parts.append(pre)
    if publish_hybrid_include_ai and ai:
        parts.append(ai)
    if suf:
        parts.append(suf)
    return sanitize_description("\n\n".join(parts))


def _rendered_mp4_paths(rd: Path, subdir: str, n: int) -> list[str | None]:
    d = rd / "rendered" / subdir
    if not d.is_dir() or n == 0:
        return [None] * n
    files = sorted(d.glob("*.mp4"))
    out: list[str | None] = []
    for i in range(n):
        if i < len(files):
            rel = files[i].relative_to(rd)
            out.append(str(rel).replace("\\", "/"))
        else:
            out.append(None)
    return out


def _fallback_snippet(run_title: str | None, rel_posix: str) -> tuple[str, str]:
    base = (run_title or "").strip() or "Clip Engine"
    clip_label = rel_posix.replace("/", " / ")
    title = sanitize_title(f"{base} — {Path(rel_posix).stem}")
    desc = sanitize_description(f"Exported from Clip Engine.\n{clip_label}")
    return title, desc


def build_youtube_snippets_for_run(rd: Path, run_title: str | None) -> list[dict[str, str]]:
    """One row per ``rendered/**/*.mp4`` in path-sorted order (matches upload loop)."""
    rendered = rd / "rendered"
    if not rendered.is_dir():
        return []
    mp4_paths = sorted(rendered.rglob("*.mp4"), key=lambda p: p.as_posix())
    plan_path = rd / "cut_plan.json"
    pub = load_publish_settings()

    by_path: dict[str, ClipItem] = {}
    if plan_path.is_file():
        try:
            plan = CutPlan.model_validate_json(plan_path.read_text(encoding="utf-8"))
            long_paths = _rendered_mp4_paths(rd, "longform", len(plan.longform_clips))
            short_paths = _rendered_mp4_paths(rd, "shortform", len(plan.shortform_clips))
            for i, c in enumerate(plan.longform_clips):
                rel = long_paths[i]
                if rel:
                    by_path[rel] = c
            for i, c in enumerate(plan.shortform_clips):
                rel = short_paths[i]
                if rel:
                    by_path[rel] = c
        except Exception:
            by_path = {}

    out: list[dict[str, str]] = []
    for path in mp4_paths:
        rel = str(path.relative_to(rd)).replace("\\", "/")
        clip = by_path.get(rel)
        if clip is None:
            t, d = _fallback_snippet(run_title, rel)
        else:
            t = resolve_publish_title(
                clip,
                run_title=run_title,
                artifact_rel=rel,
                publish_title_source=pub["publish_title_source"],  # type: ignore[arg-type]
            )
            d = resolve_publish_description(
                clip,
                publish_description_mode=pub["publish_description_mode"],  # type: ignore[arg-type]
                publish_description_prefix=pub["publish_description_prefix"],
                publish_description_suffix=pub["publish_description_suffix"],
                publish_hybrid_include_ai=pub["publish_hybrid_include_ai"],
            )
        out.append({"path": rel, "title": t, "description": d})
    return out


def metadata_json_for_artifact(
    rd: Path,
    run_title: str | None,
    mp4_rel: str,
) -> dict[str, Any]:
    """Resolved publish fields for one rendered MP4 (workspace-relative path)."""
    rel = mp4_rel.replace("\\", "/").strip().lstrip("/")
    plan_path = rd / "cut_plan.json"
    pub = load_publish_settings()
    clip: ClipItem | None = None
    if plan_path.is_file():
        try:
            plan = CutPlan.model_validate_json(plan_path.read_text(encoding="utf-8"))
            long_paths = _rendered_mp4_paths(rd, "longform", len(plan.longform_clips))
            short_paths = _rendered_mp4_paths(rd, "shortform", len(plan.shortform_clips))
            for i, c in enumerate(plan.longform_clips):
                if long_paths[i] == rel:
                    clip = c
                    break
            if clip is None:
                for i, c in enumerate(plan.shortform_clips):
                    if short_paths[i] == rel:
                        clip = c
                        break
        except Exception:
            clip = None

    if clip is None:
        t, d = _fallback_snippet(run_title, rel)
        return {
            "artifactPath": rel,
            "title": t,
            "description": d,
            "publishTitle": t,
            "publishDescription": d,
        }

    publish_title = resolve_publish_title(
        clip,
        run_title=run_title,
        artifact_rel=rel,
        publish_title_source=pub["publish_title_source"],  # type: ignore[arg-type]
    )
    publish_description = resolve_publish_description(
        clip,
        publish_description_mode=pub["publish_description_mode"],  # type: ignore[arg-type]
        publish_description_prefix=pub["publish_description_prefix"],
        publish_description_suffix=pub["publish_description_suffix"],
        publish_hybrid_include_ai=pub["publish_hybrid_include_ai"],
    )
    return {
        "artifactPath": rel,
        "title": clip.title,
        "rationale": clip.rationale,
        "publishDescriptionAi": clip.publish_description,
        "publishTitle": publish_title,
        "publishDescription": publish_description,
    }
