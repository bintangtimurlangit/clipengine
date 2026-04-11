"""Clip Engine API: health, first-run setup, future clipengine integration."""

from __future__ import annotations

import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from typing import Any, Literal

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from passlib.context import CryptContext

from clipengine import __version__ as clipengine_version

from clipengine_api.core import db
from clipengine_api.core.llm_profiles import derive_llm_profile_label
from clipengine_api.routers import catalog as catalog_router
from clipengine_api.routers import runs as runs_router
from clipengine_api.routers import settings as settings_router
from clipengine_api.routers import google_drive as gdrive_router
from clipengine_api.routers import youtube as youtube_router
from clipengine_api.routers import s3 as s3_router
from clipengine_api.routers import smb as smb_router
from clipengine_api.routers import storage_bind as storage_bind_router
from clipengine_api.routers import notifications as notifications_router
from clipengine_api.routers.settings import _validate_search_provider_token
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
    search_provider_main: str | None = None
    tavily_api_key: str | None = None
    brave_api_key: str | None = None
    brave_search_api_key: str | None = None
    exa_api_key: str | None = None
    firecrawl_api_key: str | None = None
    gemini_api_key: str | None = None
    xai_api_key: str | None = None
    moonshot_api_key: str | None = None
    kimi_api_key: str | None = None
    minimax_code_plan_key: str | None = None
    minimax_coding_api_key: str | None = None
    minimax_api_key: str | None = None
    ollama_api_key: str | None = None
    perplexity_api_key: str | None = None
    openrouter_api_key: str | None = None
    searxng_base_url: str | None = None


def _nonempty(s: str | None) -> bool:
    return bool(s and str(s).strip())


def _llm_settings_dict_from_setup(payload: SetupBody) -> dict[str, Any]:
    profiles: list[dict[str, Any]] = []
    if _nonempty(payload.openai_api_key) or _nonempty(payload.openai_base_url) or _nonempty(
        payload.openai_model
    ):
        oa_bu = (
            str(payload.openai_base_url).strip()
            if _nonempty(payload.openai_base_url)
            else None
        )
        oa_mo = str(payload.openai_model).strip() if _nonempty(payload.openai_model) else None
        profiles.append(
            {
                "id": str(uuid.uuid4()),
                "label": derive_llm_profile_label("openai", oa_bu, oa_mo),
                "provider": "openai",
                "api_key": str(payload.openai_api_key).strip()
                if _nonempty(payload.openai_api_key)
                else None,
                "base_url": oa_bu,
                "model": oa_mo,
            }
        )
    if _nonempty(payload.anthropic_api_key) or _nonempty(payload.anthropic_base_url) or _nonempty(
        payload.anthropic_model
    ):
        an_bu = (
            str(payload.anthropic_base_url).strip()
            if _nonempty(payload.anthropic_base_url)
            else None
        )
        an_mo = (
            str(payload.anthropic_model).strip() if _nonempty(payload.anthropic_model) else None
        )
        profiles.append(
            {
                "id": str(uuid.uuid4()),
                "label": derive_llm_profile_label("anthropic", an_bu, an_mo),
                "provider": "anthropic",
                "api_key": str(payload.anthropic_api_key).strip()
                if _nonempty(payload.anthropic_api_key)
                else None,
                "base_url": an_bu,
                "model": an_mo,
            }
        )
    if not profiles:
        profiles.append(
            {
                "id": str(uuid.uuid4()),
                "label": derive_llm_profile_label("openai", None, None),
                "provider": "openai",
                "api_key": None,
                "base_url": None,
                "model": None,
            }
        )

    primary_id: str | None = None
    want = payload.llm_provider
    for prof in profiles:
        if prof.get("provider") == want:
            primary_id = str(prof["id"])
            break
    if primary_id is None:
        primary_id = str(profiles[0]["id"])

    cur: dict[str, Any] = {
        "llm_provider": payload.llm_provider,
        "llm_profiles": profiles,
        "llm_primary_id": primary_id,
        "llm_fallback_ids": [],
    }

    def merge_secret(json_key: str, val: str | None) -> None:
        if not _nonempty(val):
            return
        cur[json_key] = str(val).strip()

    merge_secret("openai_api_key", payload.openai_api_key)
    merge_secret("anthropic_api_key", payload.anthropic_api_key)
    merge_secret("tavily_api_key", payload.tavily_api_key)
    merge_secret("brave_api_key", payload.brave_api_key)
    merge_secret("brave_search_api_key", payload.brave_search_api_key)
    merge_secret("exa_api_key", payload.exa_api_key)
    merge_secret("firecrawl_api_key", payload.firecrawl_api_key)
    merge_secret("gemini_api_key", payload.gemini_api_key)
    merge_secret("xai_api_key", payload.xai_api_key)
    merge_secret("moonshot_api_key", payload.moonshot_api_key)
    merge_secret("kimi_api_key", payload.kimi_api_key)
    merge_secret("minimax_code_plan_key", payload.minimax_code_plan_key)
    merge_secret("minimax_coding_api_key", payload.minimax_coding_api_key)
    merge_secret("minimax_api_key", payload.minimax_api_key)
    merge_secret("ollama_api_key", payload.ollama_api_key)
    merge_secret("perplexity_api_key", payload.perplexity_api_key)
    merge_secret("openrouter_api_key", payload.openrouter_api_key)
    merge_secret("searxng_base_url", payload.searxng_base_url)

    def merge_optional_str(json_key: str, val: str | None) -> None:
        if not _nonempty(val):
            return
        cur[json_key] = str(val).strip()

    merge_optional_str("openai_base_url", payload.openai_base_url)
    merge_optional_str("openai_model", payload.openai_model)
    merge_optional_str("anthropic_base_url", payload.anthropic_base_url)
    merge_optional_str("anthropic_model", payload.anthropic_model)

    if payload.search_provider_main is not None:
        normalized = _validate_search_provider_token(
            payload.search_provider_main, label="search_provider_main"
        )
        if normalized is not None and str(normalized).strip():
            cur["search_provider_main"] = str(normalized).strip()

    return cur


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
        """Persist admin + optional LLM and web search. Keys may be empty; configure later in
        Settings or via env — planning/search will fail at runtime until configured."""
        complete, _ = db.get_setup_state()
        if complete:
            raise HTTPException(status_code=400, detail="Setup already completed")
        h = _pwd.hash(payload.password)
        llm_json = json.dumps(
            _llm_settings_dict_from_setup(payload), ensure_ascii=False
        )
        db.complete_setup(payload.username.strip(), h, llm_json)
        return {"status": "ok"}

    app.include_router(runs_router.router, prefix="/api")
    app.include_router(catalog_router.router)
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
