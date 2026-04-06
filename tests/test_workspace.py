"""Tests for clipengine_api.services.workspace helpers."""

from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture()
def ws_env(monkeypatch, tmp_path):
    monkeypatch.setenv("CLIPENGINE_DATA_DIR", str(tmp_path))
    ws = tmp_path / "ws"
    ws.mkdir()
    monkeypatch.setenv("CLIPENGINE_WORKSPACE", str(ws))
    monkeypatch.delenv("CLIPENGINE_IMPORT_ROOTS", raising=False)
    from clipengine_api.core import db as db_module

    db_module.init_db()
    return tmp_path


# ---------------------------------------------------------------------------
# safe_join
# ---------------------------------------------------------------------------


def test_safe_join_simple(ws_env) -> None:
    from clipengine_api.services.workspace import safe_join

    root = ws_env / "root"
    root.mkdir()
    result = safe_join(root, "subdir", "file.txt")
    assert result == (root / "subdir" / "file.txt").resolve()


def test_safe_join_rejects_traversal_dotdot(ws_env) -> None:
    from clipengine_api.services.workspace import safe_join

    root = ws_env / "root"
    root.mkdir()
    with pytest.raises(ValueError, match="invalid path segment"):
        safe_join(root, "..", "etc", "passwd")


def test_safe_join_rejects_absolute_segment(ws_env) -> None:
    from clipengine_api.services.workspace import safe_join

    root = ws_env / "root"
    root.mkdir()
    with pytest.raises(ValueError):
        safe_join(root, "/etc/passwd")


# ---------------------------------------------------------------------------
# is_under_allowed
# ---------------------------------------------------------------------------


def test_is_under_allowed_true_for_file_under_workspace(ws_env) -> None:
    from clipengine_api.services.workspace import is_under_allowed, workspace_root

    video = workspace_root() / "runs" / "abc" / "video.mp4"
    video.parent.mkdir(parents=True, exist_ok=True)
    video.touch()
    assert is_under_allowed(video) is True


def test_is_under_allowed_false_for_system_path(ws_env) -> None:
    from clipengine_api.services.workspace import is_under_allowed

    assert is_under_allowed(Path("/etc/passwd")) is False


def test_is_under_allowed_custom_roots(ws_env, tmp_path) -> None:
    from clipengine_api.services.workspace import is_under_allowed

    allowed = tmp_path / "allowed"
    allowed.mkdir()
    target = allowed / "video.mp4"
    target.touch()
    assert is_under_allowed(target, roots=[allowed]) is True
    assert is_under_allowed(Path("/etc/hosts"), roots=[allowed]) is False


def test_is_under_allowed_env_import_roots(ws_env, monkeypatch, tmp_path) -> None:
    from clipengine_api.services import workspace as ws_mod

    extra_root = tmp_path / "extra"
    extra_root.mkdir()
    monkeypatch.setenv("CLIPENGINE_IMPORT_ROOTS", str(extra_root))
    roots = ws_mod.import_roots()
    resolved = {str(p) for p in roots}
    assert str(extra_root.resolve()) in resolved


# ---------------------------------------------------------------------------
# list_videos_in_dir
# ---------------------------------------------------------------------------


def test_list_videos_in_dir_returns_mp4s(tmp_path) -> None:
    from clipengine_api.services.workspace import list_videos_in_dir

    (tmp_path / "a.mp4").touch()
    (tmp_path / "b.mkv").touch()
    (tmp_path / "readme.txt").touch()
    (tmp_path / "c.webm").touch()
    videos = list_videos_in_dir(tmp_path)
    names = {v.name for v in videos}
    assert "a.mp4" in names
    assert "b.mkv" in names
    assert "c.webm" in names
    assert "readme.txt" not in names


def test_list_videos_in_dir_empty_directory(tmp_path) -> None:
    from clipengine_api.services.workspace import list_videos_in_dir

    assert list_videos_in_dir(tmp_path) == []


def test_list_videos_in_dir_nonexistent_directory(tmp_path) -> None:
    from clipengine_api.services.workspace import list_videos_in_dir

    assert list_videos_in_dir(tmp_path / "missing") == []


def test_list_videos_in_dir_sorted(tmp_path) -> None:
    from clipengine_api.services.workspace import list_videos_in_dir

    (tmp_path / "b.mp4").touch()
    (tmp_path / "a.mp4").touch()
    (tmp_path / "c.mp4").touch()
    videos = list_videos_in_dir(tmp_path)
    names = [v.name for v in videos]
    assert names == sorted(names)
