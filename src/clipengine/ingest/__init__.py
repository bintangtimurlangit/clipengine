"""Stage 1 – Ingest: audio extraction and Whisper transcription."""

from clipengine.ingest.audio import (
    AudioStreamInfo,
    FFmpegError,
    ensure_ffmpeg,
    ensure_ffprobe,
    extract_audio_wav_16k_mono,
    probe_audio_streams,
    probe_duration_s,
)
from clipengine.ingest.transcribe import transcribe_wav, transcript_to_vtt

__all__ = [
    "AudioStreamInfo",
    "FFmpegError",
    "ensure_ffmpeg",
    "ensure_ffprobe",
    "extract_audio_wav_16k_mono",
    "probe_audio_streams",
    "probe_duration_s",
    "transcribe_wav",
    "transcript_to_vtt",
]
