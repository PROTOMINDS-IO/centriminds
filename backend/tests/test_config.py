"""Settings read from the environment, and the production safety rules."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config import Settings

SECRET = "test-secret-0123456789abcdef0123456789abcdef"  # as in conftest (.gitleaks.toml)


def test_registration_emails_are_split_trimmed_and_lower_cased(monkeypatch):
    monkeypatch.setenv("REGISTRATION_EMAILS", " Alice@Example.com, ,bob@example.com ")
    assert Settings().registration_emails == ["alice@example.com", "bob@example.com"]


def test_production_refuses_sign_up_open_to_anyone():
    with pytest.raises(ValidationError, match="REGISTRATION_EMAILS"):
        Settings(app_env="production", jwt_secret=SECRET, allow_registration=True)


@pytest.mark.parametrize(
    "changes",
    [
        {"allow_registration": False},
        {"allow_registration": True, "registration_emails": ["alice@example.com"]},
    ],
)
def test_production_accepts_closed_or_invite_only_sign_up(changes):
    Settings(app_env="production", jwt_secret=SECRET, **changes)


def test_production_refuses_the_development_secret():
    with pytest.raises(ValidationError, match="JWT_SECRET"):
        Settings(app_env="production", allow_registration=False)


def test_demo_email_is_compared_lower_case() -> None:
    assert Settings(demo_email=" Demo@Example.com ").demo_email == "demo@example.com"
