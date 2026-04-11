"""Shared boto3 S3 client from Settings (read + write)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import boto3  # type: ignore[import-untyped]

from clipengine_api.core import db


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
        and c.get("secret_access_key"),
    )


def get_client_and_bucket() -> tuple[Any, str, str | None]:
    """Return (boto3 client, bucket name, endpoint_url or None)."""
    c = _load_config()
    bucket = str(c.get("bucket") or "").strip()
    region = str(c.get("region") or "").strip()
    ak = str(c.get("access_key_id") or "").strip()
    sk = str(c.get("secret_access_key") or "").strip()
    if not bucket or not region or not ak or not sk:
        raise PermissionError("S3 is not configured in Settings.")
    endpoint = str(c.get("endpoint_url") or "").strip() or None
    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=region,
        aws_access_key_id=ak,
        aws_secret_access_key=sk,
    )
    return client, bucket, endpoint


def download_object_to_path(key: str, dest: Path) -> None:
    """Download S3 object *key* in configured bucket to *dest* (file path)."""
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    client, bucket, _ = get_client_and_bucket()
    client.download_file(bucket, key, str(dest))
