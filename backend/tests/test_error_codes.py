"""Error payloads: next to the English `detail`, every deliberate API error
carries a stable `code` and the `params` a translated message needs."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from tests.conftest import override_settings

ALICE = {"email": "alice@example.com", "name": "Alice", "password": "wonderland"}


def _upload(client: TestClient, odx_bytes: bytes, **form: str):
    return client.post(
        "/api/projects",
        data={"name": "Run", **form},
        files={"file": ("run.odx", odx_bytes, "application/octet-stream")},
    )


def test_invalid_credentials(unauthed_client: TestClient) -> None:
    unauthed_client.post("/api/auth/register", json=ALICE)
    resp = unauthed_client.post(
        "/api/auth/login", json={"email": ALICE["email"], "password": "not-wonderland"}
    )
    assert resp.status_code == 401
    assert resp.json() == {
        "detail": "Invalid email or password",
        "code": "invalid_credentials",
        "params": {},
    }


def test_email_taken(unauthed_client: TestClient) -> None:
    assert unauthed_client.post("/api/auth/register", json=ALICE).status_code == 201
    resp = unauthed_client.post("/api/auth/register", json=ALICE)
    assert resp.status_code == 409
    assert resp.json()["code"] == "email_taken"


def test_registration_disabled(unauthed_client: TestClient) -> None:
    override_settings(allow_registration=False)
    resp = unauthed_client.post("/api/auth/register", json=ALICE)
    assert resp.status_code == 403
    assert resp.json()["code"] == "registration_disabled"


def test_not_invited(unauthed_client: TestClient) -> None:
    override_settings(registration_emails=["bob@example.com"])
    resp = unauthed_client.post("/api/auth/register", json=ALICE)
    assert resp.status_code == 403
    assert resp.json()["code"] == "not_invited"


def test_not_authenticated_keeps_the_bearer_challenge(unauthed_client: TestClient) -> None:
    resp = unauthed_client.get("/api/auth/me")
    assert resp.status_code == 401
    assert resp.json()["code"] == "not_authenticated"
    assert resp.headers["WWW-Authenticate"] == "Bearer"

    resp = unauthed_client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-token"})
    assert resp.status_code == 401
    assert resp.json()["code"] == "not_authenticated"


def test_rate_limited_says_when_to_retry(unauthed_client: TestClient) -> None:
    override_settings(auth_attempts_per_minute=1)
    body = {"email": "nobody@example.com", "password": "anything-goes"}
    assert unauthed_client.post("/api/auth/login", json=body).status_code == 401
    resp = unauthed_client.post("/api/auth/login", json=body)
    assert resp.status_code == 429
    assert resp.json()["code"] == "rate_limited"
    retry_after = resp.json()["params"]["retry_after"]
    assert 1 <= retry_after <= 60
    assert resp.headers["Retry-After"] == str(retry_after)


def test_project_not_found(client: TestClient) -> None:
    resp = client.get("/api/projects/99999")
    assert resp.status_code == 404
    assert resp.json() == {"detail": "Project not found", "code": "project_not_found", "params": {}}


def test_file_too_large(client: TestClient) -> None:
    override_settings(max_upload_mb=1)
    resp = _upload(client, b"x" * (1024 * 1024 + 1))
    assert resp.status_code == 413
    assert resp.json()["code"] == "file_too_large"
    assert resp.json()["params"] == {"max_mb": 1}


def test_odx_parse_failed(client: TestClient) -> None:
    resp = _upload(client, b"not an odx file")
    assert resp.status_code == 400
    body = resp.json()
    assert body["code"] == "odx_parse_failed"
    assert body["params"]["reason"]
    assert body["detail"] == f".odx parse failed: {body['params']['reason']}"


def test_upload_field_errors(client: TestClient, synthetic_odx_bytes: bytes) -> None:
    resp = _upload(client, synthetic_odx_bytes, machine_profile_id="4242")
    assert resp.status_code == 404
    assert resp.json()["code"] == "profile_not_found"

    resp = _upload(client, synthetic_odx_bytes, sensor_direction="sideways")
    assert resp.status_code == 400
    assert resp.json()["code"] == "invalid_sensor_direction"
    assert resp.json()["params"] == {
        "value": "sideways",
        "allowed": ["axial", "horizontal", "radial", "vertical"],
    }


def test_not_ratable_names_the_requested_band(
    client: TestClient, synthetic_odx_bytes: bytes
) -> None:
    # The synthetic export spans 0-3.5 Hz: nothing in the default 10-1000 Hz band.
    project = _upload(client, synthetic_odx_bytes).json()
    resp = client.post(f"/api/projects/{project['id']}/analyze")
    assert resp.status_code == 422
    assert resp.json()["code"] == "not_ratable"
    assert resp.json()["params"] == {"band_lo_hz": 10, "band_hi_hz": 1000}


def test_odx_missing(client: TestClient, synthetic_odx_bytes: bytes, tmp_path: Path) -> None:
    project = _upload(client, synthetic_odx_bytes).json()
    (tmp_path / "data" / "odx" / f"{project['id']}.odx").unlink()
    for resp in (
        client.get(f"/api/projects/{project['id']}/spectrogram"),
        client.post(f"/api/projects/{project['id']}/analyze"),
    ):
        assert resp.status_code == 404
        assert resp.json()["code"] == "odx_missing"


def test_demo_account_is_locked(client: TestClient) -> None:
    """The shared demo login keeps its password, sessions and name; its
    display settings stay the visitor's to change."""
    override_settings(demo_email="tester@example.com")
    password = {"current_password": "test-password-123", "new_password": "something-new-1"}
    for resp in (
        client.post("/api/auth/me/password", json=password),
        client.delete("/api/auth/me/sessions"),
        client.patch("/api/auth/me", json={"name": "Mallory"}),
    ):
        assert resp.status_code == 403
        assert resp.json()["code"] == "demo_account_locked"
    assert client.patch("/api/auth/me", json={"settings": {"theme": "light"}}).status_code == 200
    assert client.get("/api/auth/me").json()["name"] == "Tester"


def test_other_accounts_are_not_locked(client: TestClient) -> None:
    override_settings(demo_email="demo@example.com")
    assert client.patch("/api/auth/me", json={"name": "Renamed"}).status_code == 200
