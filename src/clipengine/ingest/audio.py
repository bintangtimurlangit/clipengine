"""FFmpeg / ffprobe helpers for audio extraction and duration probing."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path


class FFmpegError(RuntimeError):
    pass


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


def extract_audio_wav_16k_mono(video_path: Path, wav_out: Path) -> None:
    """Extract mono 16 kHz WAV for Whisper."""
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
        raise FFmpegError(proc.stderr.strip() or "ffmpeg audio extract failed")
