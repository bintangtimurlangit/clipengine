"""Upload rendered MP4s to S3-compatible storage (user credentials in SQLite)."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import boto3  # type: ignore[import-untyped]

from clipengine_api.core import db

log = logging.getLogger(__name__)


def _load_config() -> dict[str, Any]:
    raw = db.get_s3_config_json()
    if not raw:
        return {}
    try:
        out = json.loads(raw)
        return out if isinstance(out, dict) else {}
    except json.JSONDecodeError:
        return {}


def is_configured() -> bool:
    c = _load_config()
    return bool(
        c.get("bucket")
        and c.get("region")
        and c.get("access_key_id")
        and c.get("secret_access_key")
    )


def upload_rendered_mp4s(
    local_run_dir: Path,
    run_id: str,
    *,
    key_prefix_override: str | None = None,
) -> list[str]:
    """Upload ``rendered/**/*.mp4`` under *key_prefix* in the configured bucket."""
    cfg = _load_config()
    bucket = str(cfg.get("bucket") or "").strip()
    region = str(cfg.get("region") or "").strip()
    ak = str(cfg.get("access_key_id") or "").strip()
    sk = str(cfg.get("secret_access_key") or "").strip()
    if not bucket or not region or not ak or not sk:
        raise PermissionError("S3 is not configured in Settings.")

    endpoint = str(cfg.get("endpoint_url") or "").strip() or None
    base_prefix = str(cfg.get("prefix") or "").strip().strip("/")
    if base_prefix:
        base_prefix += "/"

    if key_prefix_override:
        prefix = key_prefix_override.strip().strip("/") + "/"
    else:
        prefix = f"{base_prefix}{run_id}/"

    rendered = local_run_dir / "rendered"
    if not rendered.is_dir():
        return []

    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=region,
        aws_access_key_id=ak,
        aws_secret_access_key=sk,
    )

    uploaded: list[str] = []
    for path in sorted(rendered.rglob("*.mp4")):
        rel = path.relative_to(rendered)
        key = f"{prefix}{rel.as_posix()}"
        client.upload_file(str(path), bucket, key)
        uploaded.append(key)
        log.info("Uploaded to s3://%s/%s", bucket, key)
    return uploaded
