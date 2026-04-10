"""FFmpeg / ffprobe helpers for audio extraction and duration probing."""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path


class FFmpegError(RuntimeError):
    pass


@dataclass(frozen=True)
class AudioStreamInfo:
    """One audio stream in display order; ``index`` matches FFmpeg ``-map 0:a:{index}``."""

    index: int
    codec: str
    channels: int
    language: str | None
    title: str | None


def ensure_ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if not exe:
        raise FFmpegError("ffmpeg not found on PATH")
    return exe


def ensure_ffprobe() -> str:
    exe = shutil.which("ffprobe")
    if not exe:
        raise FFmpegError("ffprobe not found on PATH")
    return exe


def probe_duration_s(video_path: Path) -> float:
    """Return container duration in seconds (float)."""
    ffprobe = ensure_ffprobe()
    cmd = [
        ffprobe,
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        str(video_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise FFmpegError(proc.stderr.strip() or "ffprobe failed")
    data = json.loads(proc.stdout)
    dur = data.get("format", {}).get("duration")
    if dur is None:
        raise FFmpegError("Could not read duration from ffprobe output")
    return float(dur)


def probe_audio_streams(video_path: Path) -> list[AudioStreamInfo]:
    """List audio streams in order; each ``index`` is the ordinal for ``-map 0:a:{index}``."""
    ffprobe = ensure_ffprobe()
    cmd = [
        ffprobe,
        "-v",
        "error",
        "-select_streams",
        "a",
        "-show_streams",
        "-of",
        "json",
        str(video_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise FFmpegError(proc.stderr.strip() or "ffprobe audio streams failed")
    data = json.loads(proc.stdout)
    streams_raw = data.get("streams") or []
    out: list[AudioStreamInfo] = []
    for i, s in enumerate(streams_raw):
        if not isinstance(s, dict):
            continue
        tags = s.get("tags") if isinstance(s.get("tags"), dict) else {}
        lang = tags.get("language")
        title = tags.get("title")
        codec = str(s.get("codec_name") or "unknown")
        ch = s.get("channels")
        channels = int(ch) if ch is not None else 0
        out.append(
            AudioStreamInfo(
                index=i,
                codec=codec,
                channels=channels,
                language=str(lang).strip() if lang else None,
                title=str(title).strip() if title else None,
            )
        )
    return out


def extract_audio_wav_16k_mono(
    video_path: Path,
    wav_out: Path,
    *,
    audio_stream_index: int = 0,
) -> None:
    """Extract mono 16 kHz WAV for Whisper from the given audio stream (``0:a:audio_stream_index``)."""
    if audio_stream_index < 0:
        raise ValueError("audio_stream_index must be non-negative")
    ffmpeg = ensure_ffmpeg()
    wav_out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(video_path),
        "-map",
        f"0:a:{audio_stream_index}",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "wav",
        str(wav_out),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise FFmpegError(proc.stderr.strip() or "ffmpeg audio extract failed")


def extract_wav_segment(
    wav_path: Path,
    wav_out: Path,
    *,
    start_s: float,
    duration_s: float,
) -> None:
    """Extract a slice of mono 16 kHz WAV (for chunked OpenAI transcription)."""
    if duration_s <= 0:
        raise ValueError("duration_s must be positive")
    ffmpeg = ensure_ffmpeg()
    wav_out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        str(start_s),
        "-i",
        str(wav_path),
        "-t",
        str(duration_s),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "wav",
        str(wav_out),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise FFmpegError(proc.stderr.strip() or "ffmpeg wav segment extract failed")
