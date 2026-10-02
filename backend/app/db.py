"""Database engine, sessions and startup migrations.

The engine is created lazily on first use. SQLite is configured for a small
multi-user server: WAL journaling (reads never wait for a write) with
synchronous=NORMAL (with WAL, a power cut can lose the last commits but
cannot corrupt the database), enforced foreign keys (SQLite leaves them off
by default) and a 5 s busy timeout so a brief lock waits instead of failing
the request.

Schema changes are Alembic migrations; `run_migrations()` applies any pending
ones before the app serves requests, so a deploy never needs a manual step.
"""

from __future__ import annotations

import logging
from collections.abc import Generator
from functools import lru_cache
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from .config import get_settings

log = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parent.parent


def make_engine(url: str) -> Engine:
    """Engine with the SQLite settings described above."""
    is_sqlite = url.startswith("sqlite")
    # Pooled connections move between threads (FastAPI runs sync endpoints in
    # a thread pool); sqlite3 refuses that unless check_same_thread is off.
    engine = create_engine(url, connect_args={"check_same_thread": False} if is_sqlite else {})
    if is_sqlite:

        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_conn, _record) -> None:
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA busy_timeout=5000")
            cur.execute("PRAGMA synchronous=NORMAL")
            cur.close()

    return engine


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    settings = get_settings()
    settings.ensure_dirs()
    return make_engine(f"sqlite:///{settings.db_path}")


@lru_cache(maxsize=1)
def _session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


def get_session() -> Generator[Session]:
    """FastAPI dependency: one session per request."""
    with _session_factory()() as session:
        yield session


def run_migrations() -> None:
    """Apply pending Alembic migrations (idempotent; runs at startup)."""
    from alembic import command
    from alembic.config import Config

    log.info("Applying database migrations")
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.attributes["configure_logger"] = False  # keep the app's logging (see alembic/env.py)
    command.upgrade(cfg, "head")


def reset_engine_cache() -> None:
    """Forget the cached engine so settings changes take effect (tests)."""
    _session_factory.cache_clear()
    get_engine.cache_clear()
