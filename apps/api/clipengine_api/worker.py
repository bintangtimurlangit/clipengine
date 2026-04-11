"""CLI entrypoint for ephemeral pipeline worker containers (`python -m clipengine_api.worker <run_id>`)."""

from __future__ import annotations

import logging
import sys

from clipengine_api.core.db import init_db
from clipengine_api.storage import runs_db
from clipengine_api.services.pipeline_execute import execute_pipeline_run

log = logging.getLogger(__name__)


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    if len(sys.argv) < 2:
        log.error("usage: python -m clipengine_api.worker <run_id>")
        sys.exit(2)
    run_id = sys.argv[1].strip()
    if not run_id:
        log.error("empty run_id")
        sys.exit(2)
    init_db()
    runs_db.init_runs_table()
    outcome = execute_pipeline_run(run_id)
    if outcome == "failed":
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
