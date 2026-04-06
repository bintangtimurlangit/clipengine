"""OpenAI Whisper transcription via ``/v1/audio/transcriptions`` (``whisper-1``)."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import httpx

from clipengine.ingest.audio import extract_wav_segment, probe_duration_s
from clipengine.models import TranscriptDoc, TranscriptSegment

# OpenAI documents a ~25 MB limit; stay under it with chunked uploads.
_MAX_REQ_BYTES = 24 * 1024 * 1024
_CHUNK_SEC = 600.0


def _transcribe_file_openai(
    wav_path: Path,
    *,
    language: str | None,
    api_key: str,
    base_url: str,
) -> tuple[list[TranscriptSegment], str | None]:
    """One HTTP call; returns segments and detected language."""
    url = f"{base_url.rstrip('/')}/audio/transcriptions"
    with httpx.Client(timeout=httpx.Timeout(600.0, connect=30.0)) as client:
        with open(wav_path, "rb") as f:
            files = {"file": (wav_path.name, f, "audio/wav")}
            data: dict[str, str] = {
                "model": "whisper-1",
                "response_format": "verbose_json",
            }
            if language:
                data["language"] = language
            r = client.post(
                url,
                headers={"Authorization": f"Bearer {api_key}"},
                files=files,
                data=data,
            )
    if r.status_code >= 400:
        raise RuntimeError(
            f"OpenAI transcription failed ({r.status_code}): {r.text[:500]}"
        )
    payload = r.json()
    lang_raw = payload.get("language")
    info_lang: str | None = lang_raw if isinstance(lang_raw, str) else None

    segments_out: list[TranscriptSegment] = []
    for seg in payload.get("segments") or []:
        if not isinstance(seg, dict):
            continue
        try:
            t0 = float(seg["start"])
            t1 = float(seg["end"])
        except (KeyError, TypeError, ValueError):
            continue
        text = (seg.get("text") or "").strip()
        segments_out.append(TranscriptSegment(start=t0, end=t1, text=text))

    if not segments_out:
        txt = payload.get("text")
        if isinstance(txt, str) and txt.strip():
            dur = float(payload.get("duration") or probe_duration_s(wav_path))
            segments_out.append(TranscriptSegment(start=0.0, end=dur, text=txt.strip()))

    return segments_out, info_lang


def transcribe_wav_openai(
    wav_path: Path,
    *,
    source_video: Path,
    language: str | None = None,
) -> TranscriptDoc:
    """
    Transcribe with OpenAI's ``/v1/audio/transcriptions`` (``whisper-1``).

    Uses ``OPENAI_API_KEY`` and optional ``OPENAI_BASE_URL`` from the environment
    (typically set from SQLite Settings before the pipeline runs).
    Long files are split into chunks under the API size limit.
    """
    api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise ValueError(
            "OpenAI transcription is selected but OPENAI_API_KEY is not set. "
            "Add an OpenAI API key under Settings."
        )
    base_url = (os.environ.get("OPENAI_BASE_URL") or "https://api.openai.com/v1").strip()

    duration_s = probe_duration_s(source_video)
    size = wav_path.stat().st_size

    all_segments: list[TranscriptSegment] = []
    info_lang: str | None = None

    if size <= _MAX_REQ_BYTES:
        segs, info_lang = _transcribe_file_openai(
            wav_path, language=language, api_key=api_key, base_url=base_url
        )
        all_segments.extend(segs)
    else:
        total_wav = probe_duration_s(wav_path)
        offset = 0.0
        while offset < total_wav:
            dur = min(_CHUNK_SEC, total_wav - offset)
            tmp_f = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            tmp_path = Path(tmp_f.name)
            tmp_f.close()
            try:
                extract_wav_segment(
                    wav_path, tmp_path, start_s=offset, duration_s=dur
                )
                segs, chunk_lang = _transcribe_file_openai(
                    tmp_path, language=language, api_key=api_key, base_url=base_url
                )
                if info_lang is None and chunk_lang:
                    info_lang = chunk_lang
                for s in segs:
                    all_segments.append(
                        TranscriptSegment(
                            start=s.start + offset,
                            end=s.end + offset,
                            text=s.text,
                        )
                    )
            finally:
                tmp_path.unlink(missing_ok=True)
            offset += dur

    return TranscriptDoc(
        source_video=str(source_video.resolve()),
        duration_s=duration_s,
        language=info_lang,
        segments=all_segments,
        whisper_model="whisper-1",
    )
