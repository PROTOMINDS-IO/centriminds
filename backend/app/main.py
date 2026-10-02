"""FastAPI application entry point.

Run with `uvicorn app.main:app` (see the Dockerfile) or through Docker Compose.
Startup (`lifespan`) applies pending database migrations before the first
request is served.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_engine, get_session, run_migrations
from .errors import AppError, app_error_handler
from .routers import analyses, auth, machines, projects, spectrograms

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    get_engine()  # creates the data directory; Alembic creates the database
    run_migrations()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    production = settings.app_env == "production"
    app = FastAPI(
        title="CentriMinds API",
        lifespan=lifespan,
        # Interactive docs are for development; production keeps the surface small.
        docs_url=None if production else "/docs",
        redoc_url=None,
        openapi_url=None if production else "/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_exception_handler(AppError, app_error_handler)
    for module in (auth, projects, spectrograms, analyses, machines):
        app.include_router(module.router)

    @app.get("/api/health")
    def health(session: Session = Depends(get_session)) -> dict[str, str]:
        """Liveness + database reachability (container health checks)."""
        session.execute(text("SELECT 1"))
        return {"status": "ok"}

    return app


app = create_app()
