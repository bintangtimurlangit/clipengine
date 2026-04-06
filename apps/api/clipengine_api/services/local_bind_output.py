"""Copy rendered MP4s to a host directory visible inside the container (Docker bind mount)."""

from __future__ import annotations

import logging
import shutil
from pathlib import Path

log = logging.getLogger(__name__)


def copy_rendered_mp4s(local_run_dir: Path, dest_root: Path, run_id: str) -> list[str]:
    """Copy ``rendered/**/*.mp4`` to ``dest_root / run_id / rendered / …``."""
    rendered = local_run_dir / "rendered"
    if not rendered.is_dir():
        return []

    out_root = (dest_root / run_id / "rendered").resolve()
    out_root.mkdir(parents=True, exist_ok=True)
    copied: list[str] = []
    for path in sorted(rendered.rglob("*.mp4")):
        rel = path.relative_to(rendered)
        target = out_root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        copied.append(str(target))
    log.info("local_bind: copied %d mp4(s) to %s", len(copied), out_root)
    return copied
