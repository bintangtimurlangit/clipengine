"""Tests for clipengine.config._env_float."""

from __future__ import annotations

import sys


def _reload_config(monkeypatch, **env_overrides):
    """Reload config module so _env_float re-reads env vars."""
    for k, v in env_overrides.items():
        monkeypatch.setenv(k, v)
    if "clipengine.config" in sys.modules:
        del sys.modules["clipengine.config"]
    import clipengine.config as cfg
    return cfg


def test_env_float_uses_default_when_unset(monkeypatch) -> None:
    monkeypatch.delenv("clipengine_LONGFORM_MIN_S", raising=False)
    cfg = _reload_config(monkeypatch)
    assert cfg.LONGFORM_MIN_DURATION_S == 180.0


def test_env_float_reads_custom_value(monkeypatch) -> None:
    cfg = _reload_config(monkeypatch, clipengine_LONGFORM_MIN_S="120.0")
    assert cfg.LONGFORM_MIN_DURATION_S == 120.0


def test_env_float_uses_default_when_blank(monkeypatch) -> None:
    cfg = _reload_config(monkeypatch, clipengine_LONGFORM_MIN_S="   ")
    assert cfg.LONGFORM_MIN_DURATION_S == 180.0


def test_env_float_strips_whitespace(monkeypatch) -> None:
    cfg = _reload_config(monkeypatch, clipengine_SHORTFORM_MIN_S="  30.5  ")
    assert cfg.SHORTFORM_MIN_DURATION_S == 30.5


def test_env_float_shortform_max(monkeypatch) -> None:
    cfg = _reload_config(monkeypatch, clipengine_SHORTFORM_MAX_S="90.0")
    assert cfg.SHORTFORM_MAX_DURATION_S == 90.0


def test_env_float_longform_max(monkeypatch) -> None:
    cfg = _reload_config(monkeypatch, clipengine_LONGFORM_MAX_S="500.0")
    assert cfg.LONGFORM_MAX_DURATION_S == 500.0
