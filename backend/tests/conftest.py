"""Shared pytest fixtures.

`client` yields a FastAPI TestClient signed in as tester@example.com, wired
to a fresh SQLite DB in a tmp directory; `unauthed_client` is the same
without a signed-in user. `decanter_profile` adds a machine profile to the
client's account (the Cyclo template with made-up numbers, see
`decanter_document`). Each test gets its own data_dir and its own engine,
so project uploads don't leak across tests. The schema comes straight from
the ORM models; test_migrations.py covers the Alembic migrations.
"""

from __future__ import annotations

from collections.abc import Generator, Iterator
from pathlib import Path
from textwrap import dedent
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_session, make_engine, reset_engine_cache
from app.main import app
from app.models import Base
from app.physics.templates import template
from app.ratelimit import auth_limiter


def _synthetic_odx(
    n_blocks: int = 3,
    bins: int = 8,
    increment: float = 0.5,
    header_path: str = "test\\synthetic",
) -> bytes:
    """Generate a minimal but spec-compliant .odx for upload tests.

    Block b runs at 1000 + 100 * b rpm with load 40 + b, and bin k holds
    0.01 * (b + 1) * (k + 1). The axis spans 0 to (bins - 1) * increment Hz
    (0-3.5 Hz by default, so nothing falls in the 10-1000 Hz rating band).
    """
    header = dedent(
        f"""\
        #Condition Monitoring - Omnitrend Data Exchange
        250
        #Date of Export
        Wed Apr 22 09:39:38 2026
        #Path
        {header_path}
        """
    )
    x_end = (bins - 1) * increment
    parts = [header]
    for b in range(n_blocks):
        ys = " ".join(f"{0.01 * (b + 1) * (k + 1):.6f}" for k in range(bins))
        parts.append(
            dedent(
                f"""\
                #Date
                {1700000000 + b}=Block {b}
                #Channel
                0
                #X-Start,Increment,X-End
                0.000000 {increment:.6f} {x_end:.6f}
                #Y-Count
                {bins}, deadbeef
                #Y-Values
                {ys}
                #RefSpeed
                {1000.0 + 100 * b}
                #RefLoad
                {40.0 + b}
                """
            )
        )
    return "".join(parts).encode("utf-8")


@pytest.fixture(autouse=True, scope="session")
def _scratch_default_data_dir(tmp_path_factory: pytest.TempPathFactory) -> Iterator[None]:
    """App startup (TestClient's lifespan) migrates the database named by the
    real settings. Point those at a scratch directory, so the tests never
    touch a developer's ./data."""
    patch = pytest.MonkeyPatch()
    patch.setenv("DATA_DIR", str(tmp_path_factory.mktemp("default-data")))
    get_settings.cache_clear()
    reset_engine_cache()
    yield
    patch.undo()
    get_settings.cache_clear()
    reset_engine_cache()


@pytest.fixture
def synthetic_odx_bytes() -> bytes:
    return _synthetic_odx()


def _peaky_odx(
    rpms: list[float] | None = None,
    increment: float = 0.5,
    max_hz: float = 100.0,
    resonance_hz: float = 73.5,
    noise_floor: float = 0.01,
) -> bytes:
    """`.odx` with a bowl-1× peak, bowl-2× peak, and a fixed resonance per block.

    The bowl harmonics track RPM; the resonance stays at `resonance_hz` across
    all blocks. Designed so peak detection, attribution against the
    `decanter_profile` and speed-independent lines all return results.
    """
    if rpms is None:
        rpms = [1000.0, 1500.0, 2000.0, 2500.0, 3000.0]
    n_bins = round(max_hz / increment) + 1
    x_end = (n_bins - 1) * increment
    header = dedent(
        """\
        #Condition Monitoring - Omnitrend Data Exchange
        250
        #Date of Export
        Wed Apr 22 09:39:38 2026
        #Path
        test\\peaky
        """
    )
    parts = [header]
    res_bin = round(resonance_hz / increment)
    for b, rpm in enumerate(rpms):
        ys = [noise_floor] * n_bins
        f_bowl = rpm / 60.0
        bin_bowl = round(f_bowl / increment)
        if 0 < bin_bowl < n_bins:
            ys[bin_bowl] = 1.0
        bin_bowl2 = round(2 * f_bowl / increment)
        if 0 < bin_bowl2 < n_bins:
            ys[bin_bowl2] = 0.5
        if 0 < res_bin < n_bins:
            ys[res_bin] = max(ys[res_bin], 0.7)
        ys_str = " ".join(f"{y:.6f}" for y in ys)
        parts.append(
            dedent(
                f"""\
                #Date
                {1700000000 + b}=Block {b}
                #Channel
                0
                #X-Start,Increment,X-End
                0.000000 {increment:.6f} {x_end:.6f}
                #Y-Count
                {n_bins}, deadbeef
                #Y-Values
                {ys_str}
                #RefSpeed
                {rpm}
                #RefLoad
                {40.0 + b}
                """
            )
        )
    return "".join(parts).encode("utf-8")


@pytest.fixture
def peaky_odx_bytes() -> bytes:
    return _peaky_odx()


@pytest.fixture(autouse=True)
def _fresh_rate_limits() -> Iterator[None]:
    """The auth limiter is process-wide and every TestClient request comes
    from the same address, so each test starts with a full sign-in budget."""
    auth_limiter.reset()
    yield
    auth_limiter.reset()


def override_settings(**changes: object) -> None:
    """Change settings for the rest of a test that uses `client` or
    `unauthed_client` (their teardown clears the override)."""
    base = app.dependency_overrides[get_settings]
    app.dependency_overrides[get_settings] = lambda: base().model_copy(update=changes)


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "odx").mkdir(parents=True, exist_ok=True)
    test_engine = make_engine(f"sqlite:///{data_dir}/test.db")
    Base.metadata.create_all(test_engine)

    def _test_settings() -> Settings:
        return Settings(
            data_dir=data_dir,
            cors_origins=["*"],
            jwt_secret="test-secret-0123456789abcdef0123456789abcdef",
            jwt_algorithm="HS256",
            jwt_expire_days=1,
            allow_registration=True,
        )

    def _test_session() -> Generator[Session]:
        # Like the app's sessions (db._session_factory), which keep what they
        # loaded after a commit: a handler that does not read back a value
        # the database changed (a session version) fails here as it would there.
        with Session(test_engine, expire_on_commit=False) as session:
            yield session

    app.dependency_overrides[get_settings] = _test_settings
    app.dependency_overrides[get_session] = _test_session
    try:
        with TestClient(app) as c:
            # Register a default user and send its bearer token with every
            # request, so tests act as a signed-in user.
            resp = c.post(
                "/api/auth/register",
                json={
                    "email": "tester@example.com",
                    "name": "Tester",
                    "password": "test-password-123",
                },
            )
            assert resp.status_code == 201, resp.text
            token = resp.json()["access_token"]
            c.headers.update({"Authorization": f"Bearer {token}"})
            yield c
    finally:
        app.dependency_overrides.clear()
        test_engine.dispose()


@pytest.fixture
def unauthed_client(tmp_path: Path) -> Iterator[TestClient]:
    """Same as `client` but without an attached bearer — for auth tests."""
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "odx").mkdir(parents=True, exist_ok=True)
    test_engine = make_engine(f"sqlite:///{data_dir}/test.db")
    Base.metadata.create_all(test_engine)

    def _test_settings() -> Settings:
        return Settings(
            data_dir=data_dir,
            cors_origins=["*"],
            jwt_secret="test-secret-0123456789abcdef0123456789abcdef",
            jwt_algorithm="HS256",
            jwt_expire_days=1,
            allow_registration=True,
        )

    def _test_session() -> Generator[Session]:
        with Session(test_engine, expire_on_commit=False) as session:  # as in `client`
            yield session

    app.dependency_overrides[get_settings] = _test_settings
    app.dependency_overrides[get_session] = _test_session
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()
        test_engine.dispose()


def decanter_document(**changes: object) -> dict[str, Any]:
    """The Cyclo decanter template with made-up numbers, a test structural
    mode, and the match pattern "test decanter"."""
    doc = template("decanter-cyclo").model_dump(mode="json")
    doc.update(
        name="Test decanter",
        match_patterns=["test decanter"],
        structural_modes=[
            {"name": "Rigid-body mode, vertical", "freq_hz": 9.2, "source": "FE modal analysis"}
        ],
    )
    doc.update(changes)
    return doc


@pytest.fixture
def decanter_profile(client: TestClient) -> dict[str, Any]:
    """A profile on the client's account (the API's MachineProfileSaved)."""
    resp = client.post("/api/machines/profiles", json={"data": decanter_document()})
    assert resp.status_code == 201, resp.text
    return resp.json()
