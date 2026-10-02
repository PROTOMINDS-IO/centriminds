"""Application settings, read from the environment and validated at startup.

Every setting maps to an upper-case environment variable of the same name
(`DATA_DIR`, `JWT_SECRET`, …). In production (`APP_ENV=production`) the app
refuses to start with the development JWT secret or one shorter than 32
characters, so a forgotten or weak secret is a failed deploy rather than
forgeable sessions. For the same reason it refuses sign-up open to anyone:
with `ALLOW_REGISTRATION=true`, production needs `REGISTRATION_EMAILS`.

Tests override `get_settings` through FastAPI's dependency overrides.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

DEV_JWT_SECRET = "dev-only-change-me"  # noqa: S105 (a placeholder, rejected in production)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    app_env: Literal["development", "production"] = "development"
    data_dir: Path = Path("./data")
    #: Comma-separated in the environment.
    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]
    jwt_secret: str = DEV_JWT_SECRET
    jwt_algorithm: Literal["HS256", "HS384", "HS512"] = "HS256"
    jwt_expire_days: int = Field(default=7, ge=1, le=90)
    allow_registration: bool = True
    #: Who may sign up while registration is open, comma-separated in the
    #: environment; empty lets anyone (development only, see below).
    registration_emails: Annotated[list[str], NoDecode] = []
    #: nginx and Caddy cap request bodies too (frontend/nginx.conf,
    #: deploy/aws/Caddyfile); raise their limits along with this one.
    max_upload_mb: int = Field(default=100, ge=1, le=1024)
    #: Sign-in, sign-up and password-change attempts per client IP per minute.
    auth_attempts_per_minute: int = Field(default=10, ge=1, le=1000)
    #: The shared demo login (app/demo.py): its password, name and sessions
    #: are locked, so one visitor cannot lock the others out. Empty: none.
    demo_email: str = ""

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [o.strip() for o in value.split(",") if o.strip()]
        return value

    @field_validator("registration_emails", mode="before")
    @classmethod
    def _split_emails(cls, value: object) -> object:
        # Compared with the lower-cased address the sign-up stores.
        if isinstance(value, str):
            value = value.split(",")
        if isinstance(value, list):
            return [e.strip().lower() for e in value if isinstance(e, str) and e.strip()]
        return value

    @field_validator("demo_email")
    @classmethod
    def _lower_demo_email(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("data_dir")
    @classmethod
    def _absolute(cls, value: Path) -> Path:
        return value.resolve()

    @model_validator(mode="after")
    def _production_safety(self) -> Settings:
        if self.app_env == "production" and (
            self.jwt_secret == DEV_JWT_SECRET or len(self.jwt_secret) < 32
        ):
            raise ValueError(
                "JWT_SECRET must be a random value of at least 32 characters in production "
                "(e.g. `openssl rand -hex 32`)"
            )
        if (
            self.app_env == "production"
            and self.allow_registration
            and not self.registration_emails
        ):
            raise ValueError(
                "ALLOW_REGISTRATION=true needs REGISTRATION_EMAILS in production "
                "(the addresses that may sign up), so sign-up is never open to anyone"
            )
        return self

    @property
    def db_path(self) -> Path:
        return self.data_dir / "app.db"

    @property
    def odx_dir(self) -> Path:
        return self.data_dir / "odx"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    def ensure_dirs(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.odx_dir.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings; `get_settings.cache_clear()` picks up env changes."""
    return Settings()
