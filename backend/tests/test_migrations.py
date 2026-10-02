"""Startup migrations: a fresh database upgrades to head, the migrated schema
is the one the ORM models describe, and migrating at startup keeps the
app's loggers."""

from __future__ import annotations

import logging
import sqlite3
from contextlib import closing

import pytest
import sqlalchemy as sa
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext

from app.config import get_settings
from app.db import make_engine, run_migrations
from app.models import Base


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    get_settings.cache_clear()
    yield tmp_path
    get_settings.cache_clear()


def test_fresh_db_upgrades_to_head(data_dir):
    run_migrations()
    with closing(sqlite3.connect(data_dir / "app.db")) as con:
        tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        version = con.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    assert version == "0001"
    assert tables == set(Base.metadata.tables) | {"alembic_version"}


def _same_float(_context, _reflected_column, _model_column, reflected, model):
    # The models' `float` columns are Double, the migration's FLOAT: SQLite
    # stores both as an 8-byte REAL, and reflects either as FLOAT.
    if isinstance(reflected, sa.Float) and isinstance(model, sa.Float):
        return False
    return None  # Alembic's own comparison


def test_migrated_schema_matches_the_models(data_dir):
    # Tables, columns, types, nullability, indexes, unique and foreign keys.
    run_migrations()
    engine = make_engine(f"sqlite:///{data_dir / 'app.db'}")
    try:
        with engine.connect() as conn:
            context = MigrationContext.configure(conn, opts={"compare_type": _same_float})
            diff = compare_metadata(context, Base.metadata)
    finally:
        engine.dispose()
    assert diff == []


def test_startup_migrations_keep_existing_loggers(data_dir):
    # Guards against the fileConfig call in alembic/env.py disabling every
    # logger that already exists, which silences uvicorn's request and error
    # logs for the lifetime of the process.
    probe = logging.getLogger("uvicorn.error")
    run_migrations()
    assert not probe.disabled
