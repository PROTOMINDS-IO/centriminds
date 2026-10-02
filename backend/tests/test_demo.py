"""The demo data command (app/demo.py): seeding, idempotence, reset."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import demo
from app.config import Settings, get_settings
from app.db import make_engine, reset_engine_cache
from app.models import AnalysisRun, Base, MachineProfile, Project, User


@pytest.fixture
def env(tmp_path: Path):
    settings = Settings(data_dir=tmp_path / "data")
    settings.ensure_dirs()
    engine = make_engine(f"sqlite:///{settings.data_dir}/demo.db")
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as session:
        user = User(email="demo@example.com", password_hash="x")
        session.add(user)
        session.commit()
        yield session, settings, user
    engine.dispose()


def _projects(session: Session, user: User) -> list[Project]:
    return list(session.scalars(select(Project).where(Project.user_id == user.id)))


def test_seed_adds_analysed_projects(env) -> None:
    session, settings, user = env
    assert demo.seed(session, settings, user) == len(demo.SWEEPS)

    projects = _projects(session, user)
    assert [p.name for p in projects] == [s.name for s in demo.SWEEPS]
    zones = {}
    for p in projects:
        assert (settings.odx_dir / f"{p.id}.odx").is_file()
        run = session.scalars(select(AnalysisRun).where(AnalysisRun.project_id == p.id)).one()
        zones[p.name] = json.loads(run.results_json)["severity"]["zone"]
    # The sweeps tell a story: a good machine, then one that needs attention.
    assert zones[demo.SWEEPS[0].name] == "good"
    assert zones[demo.SWEEPS[1].name] == "usable"


def test_seed_is_idempotent(env) -> None:
    session, settings, user = env
    demo.seed(session, settings, user)
    assert demo.seed(session, settings, user) == 0
    assert len(_projects(session, user)) == len(demo.SWEEPS)


def test_reset_clears_the_account_and_seeds_again(env) -> None:
    session, settings, user = env
    demo.seed(session, settings, user)
    session.add(Project(user_id=user.id, name="Visitor upload", odx_filename="x.odx", odx_hash="0"))
    session.commit()

    assert demo.clear(session, settings, user) == len(demo.SWEEPS) + 1
    assert _projects(session, user) == []
    assert (
        session.scalars(select(MachineProfile).where(MachineProfile.user_id == user.id)).all() == []
    )
    assert list(settings.odx_dir.iterdir()) == []

    assert demo.seed(session, settings, user) == len(demo.SWEEPS)


def test_reset_leaves_other_accounts_alone(env) -> None:
    session, settings, user = env
    client = User(email="client@example.com", password_hash="x")
    session.add(client)
    session.commit()
    demo.seed(session, settings, client)

    demo.clear(session, settings, user)
    assert len(_projects(session, client)) == len(demo.SWEEPS)


def test_sweeps_are_synthetic() -> None:
    """Nothing in a demo file points at a real machine or site."""
    profile = demo.MachineProfileData.model_validate(demo.demo_profile_document())
    text = demo.synthetic_sweep(demo.SWEEPS[0], profile).decode()
    header = text.split("#Date\n", 1)[0]
    assert "Demo" in header and demo.MATCH_PATTERN in header.lower()


def test_create_account_needs_a_real_password(env) -> None:
    session, _, _ = env
    with pytest.raises(demo.DemoError):
        demo.create_account(session, "new@example.com", "short")


def test_seed_refuses_an_unknown_account_without_create(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    get_settings.cache_clear()
    reset_engine_cache()
    try:
        assert demo.main(["seed", "--email", "nobody@example.com"]) == 1
    finally:
        get_settings.cache_clear()
        reset_engine_cache()
    assert "sign up first" in capsys.readouterr().err
