"""Auth, the signed-in user's account (/me) and per-user project isolation."""

from __future__ import annotations

import sqlite3
import time
from contextlib import closing

import jwt
import pytest
from fastapi import Depends

from app.auth import bearer_scheme, get_current_user
from app.config import get_settings
from app.db import get_session
from app.main import app
from tests.conftest import override_settings

DEFAULT_SETTINGS = {
    "theme": "dark",
    "language": "auto",
    "auto_rotate": None,
    "default_view": "3d",
    "default_scale": "linear",
    "colormap": "viridis",
    "colour_spread": "balanced",
}


def test_register_returns_token_and_user(unauthed_client):
    resp = unauthed_client.post(
        "/api/auth/register",
        json={"email": "alice@example.com", "name": "Alice", "password": "wonderland"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["email"] == "alice@example.com"
    assert body["user"]["name"] == "Alice"
    assert "id" in body["user"]


def test_register_rejects_duplicate_email(unauthed_client):
    payload = {"email": "alice@example.com", "name": "Alice", "password": "wonderland"}
    assert unauthed_client.post("/api/auth/register", json=payload).status_code == 201
    resp = unauthed_client.post("/api/auth/register", json=payload)
    assert resp.status_code == 409
    assert "already registered" in resp.json()["detail"].lower()


def test_register_trims_and_limits_the_name(unauthed_client):
    resp = unauthed_client.post(
        "/api/auth/register",
        json={"email": "cy@example.com", "name": "  Cy  ", "password": "wonderland"},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["user"]["name"] == "Cy"

    resp = unauthed_client.post(
        "/api/auth/register",
        json={"email": "dee@example.com", "name": "x" * 101, "password": "wonderland"},
    )
    assert resp.status_code == 422


def test_register_rejects_short_password(unauthed_client):
    resp = unauthed_client.post(
        "/api/auth/register",
        json={"email": "bob@example.com", "name": "Bob", "password": "short"},
    )
    assert resp.status_code == 422


def test_login_returns_token(unauthed_client):
    unauthed_client.post(
        "/api/auth/register",
        json={"email": "alice@example.com", "name": "Alice", "password": "wonderland"},
    )
    resp = unauthed_client.post(
        "/api/auth/login",
        json={"email": "alice@example.com", "password": "wonderland"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["access_token"]


def test_login_rejects_wrong_password(unauthed_client):
    unauthed_client.post(
        "/api/auth/register",
        json={"email": "alice@example.com", "name": "Alice", "password": "wonderland"},
    )
    resp = unauthed_client.post(
        "/api/auth/login",
        json={"email": "alice@example.com", "password": "nope-nope"},
    )
    assert resp.status_code == 401


def test_login_rejects_unknown_email(unauthed_client):
    resp = unauthed_client.post(
        "/api/auth/login",
        json={"email": "nobody@example.com", "password": "anything-goes"},
    )
    assert resp.status_code == 401


def test_me_requires_auth(unauthed_client):
    assert unauthed_client.get("/api/auth/me").status_code == 401


def test_me_returns_current_user(unauthed_client):
    reg = unauthed_client.post(
        "/api/auth/register",
        json={"email": "alice@example.com", "name": "Alice", "password": "wonderland"},
    )
    token = reg.json()["access_token"]
    resp = unauthed_client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "alice@example.com"


def test_me_rejects_invalid_token(unauthed_client):
    resp = unauthed_client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-token"})
    assert resp.status_code == 401


def test_projects_require_auth(unauthed_client):
    assert unauthed_client.get("/api/projects").status_code == 401


def test_two_users_cannot_see_each_others_projects(unauthed_client, peaky_odx_bytes):
    # User A
    a = unauthed_client.post(
        "/api/auth/register",
        json={"email": "a@example.com", "name": "A", "password": "alpha-pwd-123"},
    ).json()
    a_headers = {"Authorization": f"Bearer {a['access_token']}"}

    # User B
    b = unauthed_client.post(
        "/api/auth/register",
        json={"email": "b@example.com", "name": "B", "password": "bravo-pwd-123"},
    ).json()
    b_headers = {"Authorization": f"Bearer {b['access_token']}"}

    # A creates a project
    resp = unauthed_client.post(
        "/api/projects",
        files={"file": ("a.odx", peaky_odx_bytes, "application/octet-stream")},
        data={"name": "A's project"},
        headers=a_headers,
    )
    assert resp.status_code == 201, resp.text
    a_project_id = resp.json()["id"]

    # A sees their project
    a_list = unauthed_client.get("/api/projects", headers=a_headers).json()
    assert [p["id"] for p in a_list] == [a_project_id]

    # B sees nothing
    b_list = unauthed_client.get("/api/projects", headers=b_headers).json()
    assert b_list == []

    # B cannot read A's project (404 — same as not found, no enumeration leak)
    resp = unauthed_client.get(f"/api/projects/{a_project_id}", headers=b_headers)
    assert resp.status_code == 404

    # B cannot delete A's project
    resp = unauthed_client.delete(f"/api/projects/{a_project_id}", headers=b_headers)
    assert resp.status_code == 200
    assert resp.json()["deleted"] == 0
    # A still owns it
    assert (
        unauthed_client.get(f"/api/projects/{a_project_id}", headers=a_headers).status_code == 200
    )

    # B cannot run analysis on A's project
    resp = unauthed_client.post(f"/api/projects/{a_project_id}/analyze", headers=b_headers, json={})
    assert resp.status_code == 404

    # B cannot read spectrogram of A's project
    resp = unauthed_client.get(
        f"/api/projects/{a_project_id}/spectrogram/preview", headers=b_headers
    )
    assert resp.status_code == 404


def test_auth_config_is_public(unauthed_client):
    resp = unauthed_client.get("/api/auth/config")
    assert resp.status_code == 200
    assert resp.json() == {"allow_registration": True}


def test_register_only_lets_the_listed_emails_sign_up(unauthed_client):
    override_settings(registration_emails=["alice@example.com"])
    resp = unauthed_client.post(
        "/api/auth/register",
        json={"email": "Alice@Example.com", "name": "Alice", "password": "wonderland"},
    )
    assert resp.status_code == 201, resp.text
    resp = unauthed_client.post(
        "/api/auth/register",
        json={"email": "mallory@example.com", "name": "M", "password": "wonderland"},
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "not_invited"


def test_uninvited_sign_up_does_not_reveal_existing_accounts(unauthed_client):
    payload = {"email": "alice@example.com", "name": "Alice", "password": "wonderland"}
    assert unauthed_client.post("/api/auth/register", json=payload).status_code == 201
    override_settings(registration_emails=["bob@example.com"])
    resp = unauthed_client.post("/api/auth/register", json=payload)
    assert resp.status_code == 403
    assert resp.json()["code"] == "not_invited"


def _login(client, password: str):
    # The `client` fixture's account.
    return client.post(
        "/api/auth/login", json={"email": "tester@example.com", "password": password}
    )


def _change_password(client, current: str, new: str):
    return client.post(
        "/api/auth/me/password", json={"current_password": current, "new_password": new}
    )


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _other_device(client) -> dict[str, str]:
    """Headers of a second session of the `client` fixture's account, as a
    browser that signs in elsewhere gets."""
    resp = _login(client, "test-password-123")
    assert resp.status_code == 200, resp.text
    return _bearer(resp.json()["access_token"])


def _assert_session_ended(client, headers: dict[str, str] | None = None) -> None:
    """`headers` (by default the fixture's own token) no longer sign in."""
    resp = client.get("/api/auth/me", headers=headers)
    assert resp.status_code == 401
    assert resp.json()["code"] == "not_authenticated"


def test_me_returns_default_settings(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 200
    assert resp.json()["settings"] == DEFAULT_SETTINGS


def test_register_returns_default_settings(unauthed_client):
    resp = unauthed_client.post(
        "/api/auth/register",
        json={"email": "alice@example.com", "name": "Alice", "password": "wonderland"},
    )
    assert resp.json()["user"]["settings"] == DEFAULT_SETTINGS


def test_patch_me_merges_settings(client):
    resp = client.patch("/api/auth/me", json={"settings": {"language": "de"}})
    assert resp.status_code == 200, resp.text
    assert resp.json()["settings"] == {**DEFAULT_SETTINGS, "language": "de"}

    resp = client.patch("/api/auth/me", json={"settings": {"theme": "light"}})
    assert resp.status_code == 200, resp.text
    expected = {**DEFAULT_SETTINGS, "language": "de", "theme": "light"}
    assert resp.json()["settings"] == expected
    assert client.get("/api/auth/me").json()["settings"] == expected


def test_auto_rotate_can_go_back_to_the_device_default(client):
    def patch(settings: dict):
        resp = client.patch("/api/auth/me", json={"settings": settings})
        assert resp.status_code == 200, resp.text
        return resp.json()["settings"]["auto_rotate"]

    assert patch({"auto_rotate": False}) is False
    assert patch({"theme": "light"}) is False  # not sent: kept
    assert patch({"auto_rotate": None}) is None  # null: device default
    assert client.get("/api/auth/me").json()["settings"]["auto_rotate"] is None


def test_overlapping_settings_saves_both_stick(client, tmp_path):
    # The web app saves each change as soon as it is made, so another save
    # (language) can land after this request loaded the account; merging into
    # the loaded copy would drop it.
    def load_user_then_other_save(
        creds=Depends(bearer_scheme),
        session=Depends(get_session),
        settings=Depends(get_settings),
    ):
        user = get_current_user(creds, session, settings)
        with closing(sqlite3.connect(tmp_path / "data" / "test.db")) as con:
            con.execute("""UPDATE "user" SET settings = '{"language": "de"}'""")
            con.commit()
        return user

    app.dependency_overrides[get_current_user] = load_user_then_other_save
    resp = client.patch("/api/auth/me", json={"settings": {"theme": "light"}})
    assert resp.status_code == 200, resp.text
    assert resp.json()["settings"] == {**DEFAULT_SETTINGS, "language": "de", "theme": "light"}


def test_surface_colour_scheme_is_a_setting(client):
    resp = client.patch("/api/auth/me", json={"settings": {"colormap": "ocean"}})
    assert resp.status_code == 200, resp.text
    assert resp.json()["settings"]["colormap"] == "ocean"
    assert client.get("/api/auth/me").json()["settings"]["colormap"] == "ocean"
    resp = client.patch("/api/auth/me", json={"settings": {"colour_spread": "detail"}})
    assert resp.json()["settings"] == {
        **DEFAULT_SETTINGS,
        "colormap": "ocean",
        "colour_spread": "detail",
    }


def test_null_leaves_other_settings_unchanged(client):
    client.patch("/api/auth/me", json={"settings": {"theme": "light"}})
    resp = client.patch("/api/auth/me", json={"settings": {"theme": None}})
    assert resp.status_code == 200, resp.text
    assert resp.json()["settings"]["theme"] == "light"


@pytest.mark.parametrize(
    "body",
    [
        {"settings": {"theme": "purple"}},
        {"settings": {"language": "fr"}},
        {"settings": {"default_view": "side"}},
        {"settings": {"default_scale": "dB"}},
        {"settings": {"colormap": "rainbow"}},
        {"settings": {"colour_spread": "extreme"}},
        {"settings": {"colour": "red"}},  # unknown settings key
        {"email": "new@example.com"},  # not editable here
        {"name": "x" * 101},
    ],
)
def test_patch_me_rejects_invalid_values(client, body):
    resp = client.patch("/api/auth/me", json=body)
    assert resp.status_code == 422
    assert "code" not in resp.json()  # FastAPI's own validation response
    me = client.get("/api/auth/me").json()
    assert me["name"] == "Tester"
    assert me["settings"] == DEFAULT_SETTINGS


def test_patch_me_renames_and_trims(client):
    resp = client.patch("/api/auth/me", json={"name": "  Ada Lovelace  "})
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "Ada Lovelace"
    assert resp.json()["settings"] == DEFAULT_SETTINGS

    # The limit applies after trimming.
    resp = client.patch("/api/auth/me", json={"name": f" {'x' * 100} "})
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "x" * 100

    resp = client.patch("/api/auth/me", json={"settings": {"theme": "system"}})
    assert resp.json()["name"] == "x" * 100


def test_settings_come_back_on_sign_in(client):
    client.patch("/api/auth/me", json={"settings": {"theme": "light", "language": "de"}})
    resp = _login(client, "test-password-123")
    assert resp.status_code == 200, resp.text
    assert resp.json()["user"]["settings"] == {
        **DEFAULT_SETTINGS,
        "theme": "light",
        "language": "de",
    }


@pytest.mark.parametrize(
    ("stored", "expected"),
    [
        # A value this version no longer accepts reads as its default; stale
        # keys are ignored.
        ('{"theme": "purple", "language": "de", "colormap": "jet"}', {"language": "de"}),
        ("null", {}),
        ("[]", {}),
    ],
)
def test_unexpected_stored_settings_read_as_defaults(client, tmp_path, stored, expected):
    with closing(sqlite3.connect(tmp_path / "data" / "test.db")) as con:
        con.execute('UPDATE "user" SET settings = ?', (stored,))
        con.commit()
    assert client.get("/api/auth/me").json()["settings"] == {**DEFAULT_SETTINGS, **expected}

    resp = client.patch("/api/auth/me", json={"settings": {"theme": "light"}})
    assert resp.status_code == 200, resp.text
    assert resp.json()["settings"] == {**DEFAULT_SETTINGS, **expected, "theme": "light"}


def test_change_password(client):
    resp = _change_password(client, "test-password-123", "a-new-password-456")
    assert resp.status_code == 200, resp.text
    assert resp.json()["token_type"] == "bearer"
    assert resp.json()["user"]["email"] == "tester@example.com"
    old = _login(client, "test-password-123")
    assert old.status_code == 401
    assert old.json()["code"] == "invalid_credentials"
    assert _login(client, "a-new-password-456").status_code == 200


def test_change_password_ends_the_other_sessions(client):
    other_device = _other_device(client)
    resp = _change_password(client, "test-password-123", "a-new-password-456")
    assert resp.status_code == 200, resp.text

    # Every token from before the change is refused: the other device's, and
    # the one this device changed the password with...
    _assert_session_ended(client, other_device)
    _assert_session_ended(client)
    # ...which carries on with the token it got back.
    new = client.get("/api/auth/me", headers=_bearer(resp.json()["access_token"]))
    assert new.status_code == 200
    assert new.json()["email"] == "tester@example.com"


def test_each_password_change_ends_the_sessions_before_it(client):
    first = _change_password(client, "test-password-123", "a-new-password-456")
    client.headers.update(_bearer(first.json()["access_token"]))
    second = _change_password(client, "a-new-password-456", "third-password-789")
    assert second.status_code == 200, second.text

    _assert_session_ended(client)  # the first change's token
    assert client.get("/api/auth/me", headers=_bearer(second.json()["access_token"])).is_success


def test_change_password_rejects_wrong_current_password(client):
    resp = _change_password(client, "not-my-password", "a-new-password-456")
    assert resp.status_code == 400
    assert resp.json() == {
        "detail": "Current password is incorrect",
        "code": "wrong_password",
        "params": {},
    }
    assert _login(client, "test-password-123").status_code == 200
    assert client.get("/api/auth/me").status_code == 200  # still signed in


@pytest.mark.parametrize("new_password", ["short", "ä" * 40])  # 40 characters, 80 bytes
def test_change_password_rejects_invalid_new_password(client, new_password):
    resp = _change_password(client, "test-password-123", new_password)
    assert resp.status_code == 422
    assert _login(client, "test-password-123").status_code == 200


def test_register_rejects_password_over_72_bytes(unauthed_client):
    resp = unauthed_client.post(
        "/api/auth/register",
        json={"email": "alice@example.com", "name": "Alice", "password": "ä" * 40},
    )
    assert resp.status_code == 422


def test_change_password_requires_auth(unauthed_client):
    resp = _change_password(unauthed_client, "test-password-123", "a-new-password-456")
    assert resp.status_code == 401
    assert resp.json()["code"] == "not_authenticated"


def test_change_password_is_rate_limited(client):
    override_settings(auth_attempts_per_minute=2)  # the fixture's sign-up used one
    assert _change_password(client, "not-my-password", "a-new-password-456").status_code == 400
    resp = _change_password(client, "not-my-password", "a-new-password-456")
    assert resp.status_code == 429
    assert resp.json()["code"] == "rate_limited"


def test_sign_out_everywhere_ends_every_session(client):
    other_device = _other_device(client)
    resp = client.delete("/api/auth/me/sessions")
    assert resp.status_code == 204, resp.text
    assert resp.content == b""

    # The session that asked ends with the others.
    _assert_session_ended(client)
    _assert_session_ended(client, other_device)
    # Signing in again starts a session that works.
    assert client.get("/api/auth/me", headers=_other_device(client)).status_code == 200


def test_sign_out_everywhere_requires_auth(unauthed_client):
    resp = unauthed_client.delete("/api/auth/me/sessions")
    assert resp.status_code == 401
    assert resp.json()["code"] == "not_authenticated"


def test_tokens_without_a_session_version_are_refused(client):
    settings = app.dependency_overrides[get_settings]()
    now = int(time.time())
    claims = {"sub": str(client.get("/api/auth/me").json()["id"]), "iat": now, "exp": now + 60}
    unversioned = _bearer(jwt.encode(claims, settings.jwt_secret, algorithm=settings.jwt_algorithm))
    _assert_session_ended(client, unversioned)
