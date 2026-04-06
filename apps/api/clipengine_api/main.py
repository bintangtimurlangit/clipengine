"""Clip Engine API: health, first-run setup, future clipengine integration."""

from __future__ import annotations

import logging
import os
import threading
import time
from contextlib import asynccontextmanager

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from passlib.context import CryptContext

from clipengine import __version__ as clipengine_version

from clipengine_api.core import db
from clipengine_api.routers import runs as runs_router
from clipengine_api.routers import settings as settings_router
from clipengine_api.routers import google_drive as gdrive_router
from clipengine_api.routers import s3 as s3_router
from clipengine_api.routers import smb as smb_router
from clipengine_api.routers import storage_bind as storage_bind_router
from clipengine_api.storage import runs_db

log = logging.getLogger(__name__)
_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _retention_loop() -> None:
    while True:
        try:
            from clipengine_api.services.temp_retention import cleanup_expired_runs

            cleanup_expired_runs()
        except Exception:
            log.exception("retention cleanup failed")
        time.sleep(300)


class SetupBody(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=8, max_length=256)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    runs_db.init_runs_table()
    threading.Thread(target=_retention_loop, daemon=True).start()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Clip Engine API",
        version="0.1.0",
        description="Homelab backend for Clip Engine Web UI.",
        lifespan=lifespan,
    )

    origins = os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
    origins = [o.strip() for o in origins if o.strip()]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "clipengine": clipengine_version}

    @app.get("/api/setup/status")
    def setup_status() -> dict[str, bool | str | None]:
        complete, username = db.get_setup_state()
        return {"setupComplete": complete, "adminUsername": username}

    @app.post("/api/setup/complete")
    def setup_complete(payload: SetupBody = Body(...)) -> dict[str, str]:
        complete, _ = db.get_setup_state()
        if complete:
            raise HTTPException(status_code=400, detail="Setup already completed")
        h = _pwd.hash(payload.password)
        db.complete_setup(payload.username.strip(), h)
        return {"status": "ok"}

    app.include_router(runs_router.router, prefix="/api")
    app.include_router(settings_router.router, prefix="/api")
    app.include_router(gdrive_router.router)  # prefix is /api/google-drive (set in router)
    app.include_router(s3_router.router)
    app.include_router(smb_router.router)
    app.include_router(storage_bind_router.router)

    return app


app = create_app()


def run() -> None:
    import uvicorn

    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    run()
