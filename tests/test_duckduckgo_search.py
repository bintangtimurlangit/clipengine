"""DuckDuckGo HTML search (mocked; no network)."""

from __future__ import annotations

import importlib.util
import sys
import types
from pathlib import Path
from unittest.mock import MagicMock

import pytest


def _load_ddg_module(monkeypatch: pytest.MonkeyPatch, mock_ddgs_cls: MagicMock):
    fake = types.ModuleType("duckduckgo_search")
    fake.DDGS = mock_ddgs_cls
    monkeypatch.setitem(sys.modules, "duckduckgo_search", fake)
    root = Path(__file__).resolve().parents[1]
    path = root / "src/clipengine/plan/search_providers/duckduckgo.py"
    spec = importlib.util.spec_from_file_location("ce_ddg_test", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_search_formats_ddgs_results(monkeypatch: pytest.MonkeyPatch) -> None:
    mock_ddgs_cls = MagicMock()
    mock_inst = MagicMock()
    mock_inst.text.return_value = [
        {"title": "T1", "href": "https://a.example", "body": "Snippet one."},
        {"title": "T2", "href": "https://b.example", "body": "Snippet two."},
    ]
    mock_inst.__enter__ = MagicMock(return_value=mock_inst)
    mock_inst.__exit__ = MagicMock(return_value=False)
    mock_ddgs_cls.return_value = mock_inst

    ddg = _load_ddg_module(monkeypatch, mock_ddgs_cls)
    out = ddg.search("star wars", max_results=5)
    assert "T1" in out
    assert "https://a.example" in out
    assert "Snippet one" in out
    mock_inst.text.assert_called_once()
    assert mock_inst.text.call_args[1].get("safesearch") == "moderate"
