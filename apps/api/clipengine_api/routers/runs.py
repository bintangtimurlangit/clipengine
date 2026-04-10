"""Pipeline runs, import, artifacts, clips."""

from __future__ import annotations

import json
import logging
import tempfile
import threading
import zipfile
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Body, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask

from clipengine.ingest.audio import FFmpegError, probe_audio_streams
from clipengine.models import CutPlan

from clipengine_api.core.env import effective_max_upload_bytes
from clipengine_api.core.llm_status import is_llm_configured
from clipengine_api.storage import runs_db
from clipengine_api.services.pipeline_runner import (
    cancel_run,
    copy_local_file,
    fetch_youtube,
    find_video_for_run,
    start_pipeline,
)
from clipengine_api.services.publish_metadata import (
    load_publish_settings,
    metadata_json_for_artifact,
    resolve_publish_description,
    resolve_publish_title,
)
from clipengine_api.services.workspace import (
    import_roots,
    is_under_allowed,
    list_videos_in_dir,
    run_dir,
    workspace_root,
)

log = logging.getLogger(__name__)

router = APIRouter(tags=["runs"])


class OutputDestination(BaseModel):
    """Chosen when starting the pipeline (per run)."""

    kind: Literal["workspace", "google_drive", "youtube", "s3", "smb", "local_bind"] = (
        "workspace"
    )
    google_drive_folder_id: str | None = None
    # YouTube: upload rendered MP4s to the OAuth-connected channel (Settings → YouTube)
    youtube_privacy: Literal["private", "unlisted", "public"] | None = "private"
    # Optional S3 key prefix (under bucket); default is settings.prefix + run_id + /
    s3_key_prefix: str | None = None
    # Optional extra path under Settings remote base for SMB
    smb_subpath: str | None = None
    # Directory inside the container; must be under import/bind allowlist (see Settings)
    local_bind_path: str | None = None


class StartRunBody(BaseModel):
    output_destination: OutputDestination | None = None
    skip_llm_plan: bool = False
    # Ordinal of the audio stream (``0:a:N``); must match ``GET .../audio-streams``.
    audio_stream_index: int = 0


class CreateRunBody(BaseModel):
    source_type: Literal["upload", "youtube_url", "local_path", "google_drive"]
    title: str | None = None
    # youtube_url / generic video URL (yt-dlp handles many sites)
    youtube_url: str | None = None
    # local_path — file inside a CLIPENGINE_IMPORT_ROOTS directory (or Docker volume)
    local_path: str | None = None
    # google_drive — file ID or share URL
    google_drive_file_id: str | None = None
    whisper_model: str = "tiny"
    whisper_device: str = "auto"
    whisper_compute_type: str = "default"


def _run_to_json(r: runs_db.RunRecord) -> dict[str, Any]:
    return r.to_dict()


@router.get("/import/roots")
def get_import_roots() -> dict[str, Any]:
    roots = import_roots()
    return {
        "roots": [{"path": str(r), "exists": r.is_dir()} for r in roots],
        "workspace": str(workspace_root()),
    }


@router.get("/import/videos")
def list_import_videos(
    path: str = Query(..., description="Directory path under an allowlisted root"),
) -> dict[str, Any]:
    p = Path(path).resolve()
    if not p.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory")
    if not is_under_allowed(p):
        raise HTTPException(status_code=403, detail="Path not in allowlisted import roots")
    videos = list_videos_in_dir(p)
    return {
        "directory": str(p),
        "videos": [{"name": v.name, "path": str(v)} for v in videos],
    }


@router.post("/runs")
def create_run(body: CreateRunBody) -> dict[str, Any]:
    if body.source_type == "youtube_url":
        if not body.youtube_url:
            raise HTTPException(status_code=400, detail="youtube_url required")
        r = runs_db.create_run(
            source_type="youtube_url",
            title=body.title,
            youtube_url=body.youtube_url,
            whisper_model=body.whisper_model,
            whisper_device=body.whisper_device,
            whisper_compute_type=body.whisper_compute_type,
            status="fetching",
        )

        def _bg() -> None:
            try:
                fetch_youtube(r.id, body.youtube_url or "")
                if runs_db.get_run(r.id).status == "cancelled":
                    return
                runs_db.update_run(
                    r.id,
                    status="ready",
                    youtube_url=body.youtube_url,
                )
            except Exception as e:
                log.exception("youtube fetch")
                if runs_db.get_run(r.id).status != "cancelled":
                    runs_db.update_run(r.id, status="failed", error=str(e))

        threading.Thread(target=_bg, daemon=True).start()
        return {"run": _run_to_json(runs_db.get_run(r.id))}

    if body.source_type == "local_path":
        if not body.local_path:
            raise HTTPException(status_code=400, detail="local_path required")
        src = Path(body.local_path).resolve()
        if not src.is_file():
            raise HTTPException(status_code=400, detail="File not found")
        if src.suffix.lower() not in {
            ".mp4",
            ".mkv",
            ".webm",
            ".mov",
            ".avi",
            ".m4v",
        }:
            raise HTTPException(status_code=400, detail="Not a supported video file")
        if not is_under_allowed(src):
            raise HTTPException(status_code=403, detail="Path not in allowlisted import roots")
        r = runs_db.create_run(
            source_type="local_path",
            title=body.title,
            local_source_path=str(src),
            whisper_model=body.whisper_model,
            whisper_device=body.whisper_device,
            whisper_compute_type=body.whisper_compute_type,
            status="pending",
        )
        copy_local_file(r.id, src)
        runs_db.update_run(
            r.id,
            status="ready",
            source_filename=src.name,
        )
        return {"run": _run_to_json(runs_db.get_run(r.id))}

    if body.source_type == "google_drive":
        if not body.google_drive_file_id:
            raise HTTPException(status_code=400, detail="google_drive_file_id required")
        from clipengine_api.services.google_drive import (
            download_file as gdrive_download,
            is_connected as gdrive_connected,
            parse_file_id,
        )
        if not gdrive_connected():
            raise HTTPException(
                status_code=401,
                detail="Google Drive not connected — complete the OAuth flow in Settings.",
            )
        file_id = parse_file_id(body.google_drive_file_id)
        r = runs_db.create_run(
            source_type="google_drive",
            title=body.title,
            whisper_model=body.whisper_model,
            whisper_device=body.whisper_device,
            whisper_compute_type=body.whisper_compute_type,
            status="fetching",
        )

        def _bg_gdrive() -> None:
            try:
                dest = gdrive_download(file_id, run_dir(r.id))
                if runs_db.get_run(r.id).status == "cancelled":
                    return
                runs_db.update_run(
                    r.id,
                    status="ready",
                    source_filename=dest.name,
                    local_source_path=str(dest),
                )
            except Exception as exc:
                log.exception("google drive download failed")
                if runs_db.get_run(r.id).status != "cancelled":
                    runs_db.update_run(r.id, status="failed", error=str(exc))

        threading.Thread(target=_bg_gdrive, daemon=True).start()
        return {"run": _run_to_json(runs_db.get_run(r.id))}

    # upload — create empty run, client uploads next
    r = runs_db.create_run(
        source_type="upload",
        title=body.title,
        whisper_model=body.whisper_model,
        whisper_device=body.whisper_device,
        whisper_compute_type=body.whisper_compute_type,
        status="pending",
    )
    return {"run": _run_to_json(r)}


@router.post("/runs/{run_id}/upload")
async def upload_run_video(
    run_id: str,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    try:
        rec = runs_db.get_run(run_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Run not found") from None
    if rec.source_type != "upload":
        raise HTTPException(status_code=400, detail="Run is not an upload run")
    if rec.status not in ("pending", "failed"):
        raise HTTPException(status_code=400, detail="Run cannot accept upload in this state")

    rd = run_dir(run_id)
    rd.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "video.mp4").suffix.lower() or ".mp4"
    if ext not in {".mp4", ".mkv", ".webm", ".mov", ".avi", ".m4v"}:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    dest = rd / f"source{ext}"
    data = await file.read()
    max_bytes = effective_max_upload_bytes()
    if len(data) > max_bytes:
        gb = max_bytes / (1024**3)
        raise HTTPException(
            status_code=400,
            detail=f"File too large (max {gb:.1f} GiB); change Pipeline → max upload in Settings or CLIPENGINE_MAX_UPLOAD_BYTES",
        )
    dest.write_bytes(data)
    runs_db.update_run(
        run_id,
        status="ready",
        source_filename=file.filename,
        error=None,
    )
    return {"run": _run_to_json(runs_db.get_run(run_id))}


@router.get("/runs/{run_id}/audio-streams")
def get_run_audio_streams(run_id: str) -> dict[str, Any]:
    try:
        rec = runs_db.get_run(run_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Run not found") from None
    if rec.status != "ready":
        raise HTTPException(
            status_code=400,
            detail=f"Run must be ready (current: {rec.status})",
        )
    video = find_video_for_run(run_id)
    if video is None:
        raise HTTPException(
            status_code=404,
            detail="No video file in run directory; upload or fetch first.",
        )
    try:
        streams = probe_audio_streams(video)
    except FFmpegError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    if not streams:
        raise HTTPException(
            status_code=400,
            detail="No audio streams found in the source file",
        )
    return {
        "streams": [
            {
                "index": s.index,
                "codec": s.codec,
                "channels": s.channels,
                "language": s.language,
                "title": s.title,
            }
            for s in streams
        ]
    }


@router.post("/runs/{run_id}/start")
def start_run(
    run_id: str,
    body: StartRunBody | None = Body(None),
) -> dict[str, Any]:
    try:
        rec = runs_db.get_run(run_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Run not found") from None
    if rec.status != "ready":
        raise HTTPException(
            status_code=400,
            detail=f"Run must be ready (current: {rec.status})",
        )

    start_body = body or StartRunBody()
    skip_llm = bool(start_body.skip_llm_plan)
    if not skip_llm and not is_llm_configured():
        raise HTTPException(
            status_code=400,
            detail=(
                "LLM is not configured (no API key for the selected provider). "
                "Add a key under Settings, or start with skip_llm_plan to use a heuristic "
                "cut plan without an LLM."
            ),
        )
    runs_db.merge_run_extra(
        run_id,
        {"planMode": "heuristic" if skip_llm else "llm"},
    )

    video = find_video_for_run(run_id)
    if video is None:
        raise HTTPException(
            status_code=400,
            detail="No video file in run directory; upload or fetch first.",
        )
    try:
        audio_streams = probe_audio_streams(video)
    except FFmpegError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    if not audio_streams:
        raise HTTPException(
            status_code=400,
            detail="No audio streams found in the source file",
        )
    ai = start_body.audio_stream_index
    if ai < 0 or ai >= len(audio_streams):
        raise HTTPException(
            status_code=400,
            detail=f"audio_stream_index must be between 0 and {len(audio_streams) - 1}",
        )
    runs_db.merge_run_extra(run_id, {"audioStreamIndex": ai})

    od = (
        start_body.output_destination
        if start_body.output_destination
        else OutputDestination()
    )
    if od.kind == "google_drive":
        if not od.google_drive_folder_id or not str(od.google_drive_folder_id).strip():
            raise HTTPException(
                status_code=400,
                detail="google_drive_folder_id required when kind is google_drive",
            )
        from clipengine_api.services.google_drive import is_connected, parse_folder_id

        if not is_connected():
            raise HTTPException(
                status_code=401,
                detail="Google Drive not connected — complete OAuth in Settings.",
            )
        runs_db.merge_run_extra(
            run_id,
            {
                "outputDestination": {
                    "kind": "google_drive",
                    "googleDriveFolderId": parse_folder_id(od.google_drive_folder_id.strip()),
                }
            },
        )
    elif od.kind == "youtube":
        from clipengine_api.services.youtube_upload import is_connected as yt_connected

        if not yt_connected():
            raise HTTPException(
                status_code=401,
                detail="YouTube not connected — complete OAuth under Settings → YouTube.",
            )
        priv = (od.youtube_privacy or "private").lower()
        if priv not in ("private", "unlisted", "public"):
            priv = "private"
        runs_db.merge_run_extra(
            run_id,
            {"outputDestination": {"kind": "youtube", "youtubePrivacy": priv}},
        )
    elif od.kind == "s3":
        from clipengine_api.services import s3_output

        if not s3_output.is_configured():
            raise HTTPException(
                status_code=401,
                detail="S3 is not configured — add credentials in Settings.",
            )
        out: dict[str, Any] = {"kind": "s3"}
        if od.s3_key_prefix and str(od.s3_key_prefix).strip():
            p = str(od.s3_key_prefix).strip().strip("/")
            out["s3KeyPrefix"] = p + "/"
        runs_db.merge_run_extra(run_id, {"outputDestination": out})
    elif od.kind == "smb":
        from clipengine_api.services import smb_output

        if not smb_output.is_configured():
            raise HTTPException(
                status_code=401,
                detail="SMB is not configured — add connection in Settings.",
            )
        out_smb: dict[str, Any] = {"kind": "smb"}
        if od.smb_subpath and str(od.smb_subpath).strip():
            out_smb["smbSubpath"] = str(od.smb_subpath).strip().replace("\\", "/")
        runs_db.merge_run_extra(run_id, {"outputDestination": out_smb})
    elif od.kind == "local_bind":
        if not od.local_bind_path or not str(od.local_bind_path).strip():
            raise HTTPException(
                status_code=400,
                detail="local_bind_path required when kind is local_bind",
            )
        dest = Path(str(od.local_bind_path).strip()).resolve()
        if not dest.is_dir():
            raise HTTPException(
                status_code=400,
                detail=f"local_bind_path must be an existing directory: {dest}",
            )
        if not is_under_allowed(dest):
            raise HTTPException(
                status_code=403,
                detail="local_bind_path must be under workspace, CLIPENGINE_IMPORT_ROOTS, "
                "or a path registered under Settings → Storage → Local path.",
            )
        runs_db.merge_run_extra(
            run_id,
            {
                "outputDestination": {
                    "kind": "local_bind",
                    "localBindPath": str(dest),
                }
            },
        )
    else:
        runs_db.merge_run_extra(
            run_id,
            {"outputDestination": {"kind": od.kind}},
        )

    ok = start_pipeline(run_id)
    if not ok:
        raise HTTPException(
            status_code=409,
            detail="Pipeline busy or no video file in run directory",
        )
    return {"run": _run_to_json(runs_db.get_run(run_id)), "started": True}


@router.post("/runs/{run_id}/cancel")
def post_cancel_run(run_id: str) -> dict[str, Any]:
    try:
        return cancel_run(run_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Run not found") from None
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None


@router.get("/runs")
def list_runs(
    limit: int = 50,
    status: str | None = None,
) -> dict[str, Any]:
    rows = runs_db.list_runs(limit=limit, status=status)
    return {"runs": [_run_to_json(r) for r in rows]}


@router.get("/runs/{run_id}")
def get_run(run_id: str) -> dict[str, Any]:
    try:
        r = runs_db.get_run(run_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Run not found") from None
    return {"run": _run_to_json(r)}


@router.get("/runs/{run_id}/plan-activity")
def get_plan_activity(run_id: str) -> JSONResponse:
    """Structured plan-step progress (phase, web search provider, timestamps)."""
    try:
        runs_db.get_run(run_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Run not found") from None
    rd = run_dir(run_id)
    target = (rd / "plan_activity.json").resolve()
    if not str(target).startswith(str(rd.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not target.is_file():
        raise HTTPException(status_code=404, detail="No plan activity file yet")
    try:
        data = json.loads(target.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Invalid plan_activity.json: {e}") from e
    return JSONResponse(content=data)


@router.get("/runs/{run_id}/llm-activity", response_class=PlainTextResponse)
def get_llm_activity(run_id: str) -> PlainTextResponse:
    """Plain-text plan activity log (foundation LLM, web search, cut plan) during ``plan``."""
    try:
        runs_db.get_run(run_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Run not found") from None
    rd = run_dir(run_id)
    target = (rd / "llm_activity.log").resolve()
    if not str(target).startswith(str(rd.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not target.is_file():
        raise HTTPException(status_code=404, detail="No LLM activity log yet")
    return PlainTextResponse(
        content=target.read_text(encoding="utf-8"),
        media_type="text/plain; charset=utf-8",
    )


@router.get("/runs/{run_id}/artifacts")
def list_artifacts(run_id: str) -> dict[str, Any]:
    try:
        runs_db.get_run(run_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Run not found") from None
    rd = run_dir(run_id)
    if not rd.is_dir():
        return {"artifacts": []}
    artifacts: list[dict[str, Any]] = []
    for p in rd.rglob("*"):
        if p.is_file():
            rel = p.relative_to(rd)
            artifacts.append(
                {
                    "path": str(rel).replace("\\", "/"),
                    "size": p.stat().st_size,
                }
            )
    artifacts.sort(key=lambda x: x["path"])
    return {"artifacts": artifacts}


@router.get("/runs/{run_id}/artifacts/download")
def download_artifact(run_id: str, path: str) -> FileResponse:
    try:
        runs_db.get_run(run_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Run not found") from None
    rd = run_dir(run_id)
    target = (rd / path).resolve()
    if not str(target).startswith(str(rd.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        path=str(target),
        filename=target.name,
        media_type="application/octet-stream",
    )


@router.get("/runs/{run_id}/artifacts/render-zip")
def download_render_zip(
    run_id: str,
    path: str = Query(
        ...,
        description="Workspace-relative path to a rendered .mp4 under rendered/",
    ),
) -> FileResponse:
    """ZIP the rendered MP4 with its sibling .jpg thumbnail (same basename), if present."""
    try:
        rec = runs_db.get_run(run_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Run not found") from None
    rd = run_dir(run_id)
    rel = path.replace("\\", "/").strip().lstrip("/")
    if not rel.lower().endswith(".mp4"):
        raise HTTPException(status_code=400, detail="path must be a .mp4 file")
    parts = rel.split("/")
    if len(parts) < 2 or parts[0] != "rendered":
        raise HTTPException(status_code=400, detail="Only files under rendered/ are supported")
    target_mp4 = (rd / rel).resolve()
    if not str(target_mp4).startswith(str(rd.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not target_mp4.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    thumb_rel = _thumbnail_path_for_mp4(rd, rel)
    jpg_path: Path | None = None
    if thumb_rel:
        cand = (rd / thumb_rel).resolve()
        if str(cand).startswith(str(rd.resolve())) and cand.is_file():
            jpg_path = cand

    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tf:
        tmp_path = Path(tf.name)
    try:
        meta = metadata_json_for_artifact(rd, rec.title, rel)
        publish_title = str(meta.get("publishTitle") or meta.get("title") or "")
        publish_body = str(meta.get("publishDescription") or "")
        txt_blob = f"{publish_title}\n\n{publish_body}".strip() + "\n"
        json_blob = json.dumps(meta, indent=2, ensure_ascii=False) + "\n"
        with zipfile.ZipFile(tmp_path, "w", compression=zipfile.ZIP_STORED) as zf:
            zf.write(target_mp4, arcname=target_mp4.name)
            if jpg_path is not None:
                zf.write(jpg_path, arcname=jpg_path.name)
            zf.writestr("publish_metadata.json", json_blob)
            zf.writestr("publish.txt", txt_blob)
        zip_name = f"{target_mp4.stem}.zip"
        return FileResponse(
            path=str(tmp_path),
            filename=zip_name,
            media_type="application/zip",
            background=BackgroundTask(lambda p=tmp_path: p.unlink(missing_ok=True)),
        )
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


def _rendered_mp4_paths(rd: Path, subdir: str, n: int) -> list[str | None]:
    """Pair N clips with sorted rendered/*.mp4 files (same order as ``render_plan``)."""
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


def _thumbnail_path_for_mp4(rd: Path, mp4_rel: str | None) -> str | None:
    """Sibling ``.jpg`` next to each rendered ``.mp4``, if present."""
    if not mp4_rel or not mp4_rel.endswith(".mp4"):
        return None
    jpg = Path(mp4_rel).with_suffix(".jpg")
    if (rd / jpg).is_file():
        return str(jpg).replace("\\", "/")
    return None


@router.get("/runs/{run_id}/clips")
def list_clips(run_id: str) -> dict[str, Any]:
    """Structured clips from cut_plan.json (Phase B)."""
    try:
        rec = runs_db.get_run(run_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Run not found") from None
    rd = run_dir(run_id)
    plan_path = rd / "cut_plan.json"
    if not plan_path.is_file():
        return {
            "clips": [],
            "longform": [],
            "shortform": [],
            "notes": None,
            "editorialSummary": None,
        }
    raw = plan_path.read_text(encoding="utf-8")
    plan = CutPlan.model_validate_json(raw)

    long_paths = _rendered_mp4_paths(rd, "longform", len(plan.longform_clips))
    short_paths = _rendered_mp4_paths(rd, "shortform", len(plan.shortform_clips))
    pub = load_publish_settings()

    def item_dict(
        prefix: str,
        i: int,
        c: Any,
        artifact_rel: str | None,
    ) -> dict[str, Any]:
        thumb = _thumbnail_path_for_mp4(rd, artifact_rel)
        publish_title = resolve_publish_title(
            c,
            run_title=rec.title,
            artifact_rel=artifact_rel,
            publish_title_source=pub["publish_title_source"],  # type: ignore[arg-type]
        )
        publish_description = resolve_publish_description(
            c,
            publish_description_mode=pub["publish_description_mode"],  # type: ignore[arg-type]
            publish_description_prefix=pub["publish_description_prefix"],
            publish_description_suffix=pub["publish_description_suffix"],
            publish_hybrid_include_ai=pub["publish_hybrid_include_ai"],
        )
        return {
            "id": f"{prefix}-{i}",
            "kind": prefix,
            "start_s": c.start_s,
            "end_s": c.end_s,
            "title": c.title,
            "description": c.rationale,
            "rationale": c.rationale,
            "publishDescriptionAi": c.publish_description,
            "publishTitle": publish_title,
            "publishDescription": publish_description,
            "artifactPath": artifact_rel,
            "thumbnailPath": thumb,
        }

    longform = [
        item_dict("longform", i, c, long_paths[i])
        for i, c in enumerate(plan.longform_clips)
    ]
    shortform = [
        item_dict("shortform", i, c, short_paths[i])
        for i, c in enumerate(plan.shortform_clips)
    ]
    clips = longform + shortform
    return {
        "clips": clips,
        "longform": longform,
        "shortform": shortform,
        "notes": plan.notes,
        "editorialSummary": plan.editorial_summary,
    }


@router.delete("/runs/{run_id}/artifacts")
def delete_artifact(run_id: str, path: str = Query(..., description="Path relative to run dir")) -> dict[str, str]:
    """Delete a single file under the run workspace (restricted to ``rendered/**``)."""
    try:
        runs_db.get_run(run_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Run not found") from None
    rd = run_dir(run_id)
    target = (rd / path).resolve()
    if not str(target).startswith(str(rd.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")
    try:
        rel = target.relative_to(rd.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid path") from None
    parts = rel.parts
    if len(parts) < 2 or parts[0] != "rendered":
        raise HTTPException(
            status_code=403,
            detail="Only files under rendered/ can be deleted from the API",
        )
    if not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    target.unlink()
    return {"status": "ok"}


@router.delete("/runs/{run_id}")
def delete_run(run_id: str) -> dict[str, str]:
    import shutil

    try:
        runs_db.get_run(run_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Run not found") from None
    rd = run_dir(run_id)
    if rd.is_dir():
        shutil.rmtree(rd, ignore_errors=True)
    runs_db.delete_run(run_id)
    return {"status": "ok"}


@router.get("/automation")
def automation_status() -> dict[str, Any]:
    """Automation overview: integrations + future folder watch / schedule / webhook."""
    from clipengine_api.services.youtube_upload import (
        has_client_credentials as yt_has_creds,
        is_connected as yt_connected,
    )

    youtube_ready = yt_has_creds() and yt_connected()
    lines = [
        "YouTube: upload is available when you connect OAuth under Settings → YouTube "
        "and choose YouTube as the output destination when starting a run.",
        f"YouTube connection: {'ready' if youtube_ready else 'not connected'}.",
        "Folder watch, cron, and webhooks are not enabled yet — use the dashboard or API to enqueue runs.",
    ]
    automated = runs_db.list_automated_runs(limit=100)
    return {
        "mode": "integrations",
        "youtube": {
            "hasCredentials": yt_has_creds(),
            "connected": yt_connected(),
            "uploadReady": youtube_ready,
        },
        "automatedRuns": [_run_to_json(r) for r in automated],
        "message": "\n".join(lines),
    }
