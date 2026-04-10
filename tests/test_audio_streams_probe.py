"""Tests for ffprobe audio stream discovery (mocked subprocess)."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from clipengine.ingest.audio import (
    AudioStreamInfo,
    FFmpegError,
    extract_audio_wav_16k_mono,
    probe_audio_streams,
)


def test_probe_audio_streams_parses_ffprobe_json(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    video = tmp_path / "x.mkv"
    video.write_bytes(b"dummy")

    payload = {
        "streams": [
            {
                "codec_name": "aac",
                "channels": 2,
                "tags": {"language": "eng", "title": "Commentary"},
            },
            {
                "codec_name": "ac3",
                "channels": 6,
                "tags": {"language": "jpn"},
            },
        ]
    }

    def fake_run(
        cmd: list[str],
        *,
        capture_output: bool = True,
        text: bool = True,
        check: bool = False,
    ) -> MagicMock:
        assert "ffprobe" in cmd[0] or cmd[0].endswith("ffprobe")
        r = MagicMock()
        r.returncode = 0
        r.stdout = json.dumps(payload)
        r.stderr = ""
        return r

    monkeypatch.setattr("clipengine.ingest.audio.subprocess.run", fake_run)

    streams = probe_audio_streams(video)
    assert len(streams) == 2
    assert streams[0] == AudioStreamInfo(
        index=0,
        codec="aac",
        channels=2,
        language="eng",
        title="Commentary",
    )
    assert streams[1] == AudioStreamInfo(
        index=1,
        codec="ac3",
        channels=6,
        language="jpn",
        title=None,
    )


def test_probe_audio_streams_empty_raises_ffprobe_error(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    video = tmp_path / "x.mp4"
    video.write_bytes(b"x")

    def fake_run(*args: object, **kwargs: object) -> MagicMock:
        r = MagicMock()
        r.returncode = 1
        r.stdout = ""
        r.stderr = "nope"
        return r

    monkeypatch.setattr("clipengine.ingest.audio.subprocess.run", fake_run)

    with pytest.raises(FFmpegError, match="nope"):
        probe_audio_streams(video)


def test_extract_audio_wav_maps_audio_stream_index(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    video = tmp_path / "v.mkv"
    video.write_bytes(b"v")
    wav = tmp_path / "out.wav"

    captured: list[list[str]] = []

    def fake_run(
        cmd: list[str],
        *,
        capture_output: bool = True,
        text: bool = True,
        check: bool = False,
    ) -> MagicMock:
        captured.append(cmd)
        r = MagicMock()
        r.returncode = 0
        r.stderr = ""
        return r

    monkeypatch.setattr("clipengine.ingest.audio.subprocess.run", fake_run)
    monkeypatch.setattr("clipengine.ingest.audio.shutil.which", lambda _: "/bin/ffmpeg")

    extract_audio_wav_16k_mono(video, wav, audio_stream_index=2)
    assert captured and "-map" in captured[0]
    i = captured[0].index("-map")
    assert captured[0][i + 1] == "0:a:2"
