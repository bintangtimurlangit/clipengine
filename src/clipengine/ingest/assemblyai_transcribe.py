"""AssemblyAI pre-recorded transcription via ``/v2/upload`` + ``/v2/transcript``."""

from __future__ import annotations

import os
import time
from pathlib import Path

import httpx

from clipengine.ingest.audio import probe_duration_s
from clipengine.models import TranscriptDoc, TranscriptSegment

_POLL_INTERVAL_S = 2.0
_MAX_POLL_S = 7200.0
_DEFAULT_BASE = "https://api.assemblyai.com"


def _auth_headers(api_key: str) -> dict[str, str]:
    """AssemblyAI expects the raw key in ``Authorization`` (no ``Bearer`` prefix)."""
    return {"Authorization": api_key.strip()}


def transcribe_wav_assemblyai(
    wav_path: Path,
    *,
    source_video: Path,
    language: str | None = None,
) -> TranscriptDoc:
    """
    Transcribe with AssemblyAI pre-recorded STT.

    Uses ``ASSEMBLYAI_API_KEY`` and optional ``ASSEMBLYAI_BASE_URL`` (default US:
    ``https://api.assemblyai.com``; EU: ``https://api.eu.assemblyai.com``) from the
    environment (typically set from SQLite Settings before the pipeline runs).
    """
    api_key = (os.environ.get("ASSEMBLYAI_API_KEY") or "").strip()
    if not api_key:
        raise ValueError(
            "AssemblyAI transcription is selected but ASSEMBLYAI_API_KEY is not set. "
            "Add your AssemblyAI API key under Settings → Transcription."
        )
    base = (os.environ.get("ASSEMBLYAI_BASE_URL") or _DEFAULT_BASE).strip().rstrip("/")

    duration_s = probe_duration_s(source_video)

    timeout = httpx.Timeout(600.0, connect=30.0)
    with httpx.Client(timeout=timeout) as client:
        with open(wav_path, "rb") as f:
            audio_bytes = f.read()
        up = client.post(
            f"{base}/v2/upload",
            headers=_auth_headers(api_key),
            content=audio_bytes,
        )
        if up.status_code >= 400:
            raise RuntimeError(
                f"AssemblyAI upload failed ({up.status_code}): {up.text[:500]}"
            )
        upload_payload = up.json()
        upload_url = upload_payload.get("upload_url")
        if not isinstance(upload_url, str) or not upload_url.strip():
            raise RuntimeError("AssemblyAI upload response missing upload_url")

        body: dict[str, object] = {"audio_url": upload_url.strip()}
        if language and str(language).strip():
            body["language_code"] = str(language).strip()

        cr = client.post(
            f"{base}/v2/transcript",
            headers={**_auth_headers(api_key), "Content-Type": "application/json"},
            json=body,
        )
        if cr.status_code >= 400:
            raise RuntimeError(
                f"AssemblyAI transcript create failed ({cr.status_code}): {cr.text[:500]}"
            )
        create_payload = cr.json()
        tid = create_payload.get("id")
        if not isinstance(tid, str) or not tid.strip():
            raise RuntimeError("AssemblyAI create response missing id")

        deadline = time.monotonic() + _MAX_POLL_S
        payload: dict[str, object] = {}
        while time.monotonic() < deadline:
            gr = client.get(
                f"{base}/v2/transcript/{tid.strip()}",
                headers=_auth_headers(api_key),
            )
            if gr.status_code >= 400:
                raise RuntimeError(
                    f"AssemblyAI transcript poll failed ({gr.status_code}): {gr.text[:500]}"
                )
            payload = gr.json()
            status = str(payload.get("status") or "").lower()
            if status == "completed":
                break
            if status == "error":
                err = payload.get("error")
                msg = err if isinstance(err, str) else str(err)
                raise RuntimeError(f"AssemblyAI transcription failed: {msg[:500]}")
            time.sleep(_POLL_INTERVAL_S)
        else:
            raise RuntimeError("AssemblyAI transcription timed out while polling")

    info_lang: str | None = None
    lang_raw = payload.get("language_code")
    if isinstance(lang_raw, str) and lang_raw.strip():
        info_lang = lang_raw.strip()

    segments_out: list[TranscriptSegment] = []
    utterances = payload.get("utterances")
    if isinstance(utterances, list):
        for seg in utterances:
            if not isinstance(seg, dict):
                continue
            try:
                t0_raw = seg.get("start")
                t1_raw = seg.get("end")
                if t0_raw is None or t1_raw is None:
                    continue
                # Utterance timestamps are in milliseconds.
                t0 = float(t0_raw) / 1000.0
                t1 = float(t1_raw) / 1000.0
            except (TypeError, ValueError):
                continue
            text = (seg.get("text") or "").strip()
            if t1 < t0:
                continue
            segments_out.append(TranscriptSegment(start=t0, end=t1, text=text))

    if not segments_out:
        txt = payload.get("text")
        if isinstance(txt, str) and txt.strip():
            segments_out.append(
                TranscriptSegment(start=0.0, end=float(duration_s), text=txt.strip())
            )

    return TranscriptDoc(
        source_video=str(source_video.resolve()),
        duration_s=duration_s,
        language=info_lang,
        segments=segments_out,
        whisper_model="assemblyai",
    )
