"""Clip Engine API: health, first-run setup, future clipengine integration."""

from __future__ import annotations

import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Any, Literal

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from passlib.context import CryptContext

from clipengine import __version__ as clipengine_version

from clipengine_api.core import db
from clipengine_api.routers import runs as runs_router
from clipengine_api.routers import settings as settings_router
from clipengine_api.routers import google_drive as gdrive_router
from clipengine_api.routers import youtube as youtube_router
from clipengine_api.routers import s3 as s3_router
from clipengine_api.routers import smb as smb_router
from clipengine_api.routers import storage_bind as storage_bind_router
from clipengine_api.routers import notifications as notifications_router
from clipengine_api.storage import runs_db

log = logging.getLogger(__name__)
_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


class SetupBody(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=8, max_length=256)
    llm_provider: Literal["openai", "anthropic"] = "openai"
    openai_api_key: str | None = None
    openai_base_url: str | None = None
    openai_model: str | None = None
    anthropic_api_key: str | None = None
    anthropic_base_url: str | None = None
    anthropic_model: str | None = None
    tavily_api_key: str | None = None


def _nonempty(s: str | None) -> bool:
    return bool(s and str(s).strip())


def _env_key_set(name: str) -> bool:
    v = os.environ.get(name)
    return bool(v and str(v).strip())


def _llm_settings_dict_from_setup(payload: SetupBody) -> dict[str, Any]:
    cur: dict[str, Any] = {"llm_provider": payload.llm_provider}

    def merge_secret(json_key: str, val: str | None) -> None:
        if not _nonempty(val):
            return
        cur[json_key] = str(val).strip()

    merge_secret("openai_api_key", payload.openai_api_key)
    merge_secret("anthropic_api_key", payload.anthropic_api_key)
    merge_secret("tavily_api_key", payload.tavily_api_key)

    def merge_optional_str(json_key: str, val: str | None) -> None:
        if not _nonempty(val):
            return
        cur[json_key] = str(val).strip()

    merge_optional_str("openai_base_url", payload.openai_base_url)
    merge_optional_str("openai_model", payload.openai_model)
    merge_optional_str("anthropic_base_url", payload.anthropic_base_url)
    merge_optional_str("anthropic_model", payload.anthropic_model)

    return cur


def _validate_setup_keys(payload: SetupBody) -> None:
    if payload.llm_provider == "openai":
        if not (
            _nonempty(payload.openai_api_key) or _env_key_set("OPENAI_API_KEY")
        ):
            raise HTTPException(
                status_code=400,
                detail="OpenAI API key is required (or set OPENAI_API_KEY in the environment).",
            )
    else:
        if not (
            _nonempty(payload.anthropic_api_key) or _env_key_set("ANTHROPIC_API_KEY")
        ):
            raise HTTPException(
                status_code=400,
                detail="Anthropic API key is required (or set ANTHROPIC_API_KEY in the environment).",
            )
    if not (_nonempty(payload.tavily_api_key) or _env_key_set("TAVILY_API_KEY")):
        raise HTTPException(
            status_code=400,
            detail="Tavily API key is required (or set TAVILY_API_KEY in the environment).",
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    runs_db.init_runs_table()
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
        _validate_setup_keys(payload)
        h = _pwd.hash(payload.password)
        llm_json = json.dumps(
            _llm_settings_dict_from_setup(payload), ensure_ascii=False
        )
        db.complete_setup(payload.username.strip(), h, llm_json)
        return {"status": "ok"}

    app.include_router(runs_router.router, prefix="/api")
    app.include_router(settings_router.router, prefix="/api")
    app.include_router(gdrive_router.router)  # prefix is /api/google-drive (set in router)
    app.include_router(youtube_router.router)
    app.include_router(s3_router.router)
    app.include_router(smb_router.router)
    app.include_router(storage_bind_router.router)
    app.include_router(notifications_router.router)

    return app


app = create_app()


def run() -> None:
    import uvicorn

    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    run()
