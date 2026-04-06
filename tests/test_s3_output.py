"""Unit tests for S3 upload helper (mocked boto3)."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture()
def s3_configured(monkeypatch, tmp_path):
    monkeypatch.setenv("CLIPENGINE_DATA_DIR", str(tmp_path))
    from clipengine_api.core import db as db_module

    db_module.init_db()
    cfg = {
        "endpoint_url": "",
        "region": "us-east-1",
        "bucket": "my-bucket",
        "prefix": "pfx/",
        "access_key_id": "AKIA",
        "secret_access_key": "secret",
    }
    db_module.save_s3_config_json(json.dumps(cfg))
    return tmp_path


def test_upload_rendered_mp4s_calls_boto3(s3_configured, tmp_path) -> None:
    from clipengine_api.services import s3_output

    run_id = "run-uuid-1"
    rd = tmp_path / "ws" / "runs" / run_id
    (rd / "rendered" / "longform").mkdir(parents=True)
    (rd / "rendered" / "longform" / "a.mp4").write_bytes(b"x")

    mock_client = MagicMock()
    with patch.object(s3_output, "boto3") as mock_boto:
        mock_boto.client.return_value = mock_client
        keys = s3_output.upload_rendered_mp4s(rd, run_id, key_prefix_override=None)

    assert len(keys) == 1
    mock_client.upload_file.assert_called_once()
    args = mock_client.upload_file.call_args[0]
    assert args[1] == "my-bucket"
    assert args[2] == "pfx/run-uuid-1/longform/a.mp4"
