"""Authentication utilities: password hashing, JWT issuance, FastAPI deps.

A single access token (no refresh) keeps the surface small. The token is a
JWT signed with `settings.jwt_secret`; clients store it in localStorage and
send it as `Authorization: Bearer <token>`. Tokens expire after
`settings.jwt_expire_days`.

The server keeps no list of sessions, so it ends them by version instead:
each token carries the account's `token_version` (claim `ver`) and is refused
once that has moved on. `end_sessions` moves it, for a password change and
for "sign out everywhere".

Password hashing uses bcrypt directly. Passwords can be at most 72 bytes
(bcrypt's hard limit); `schemas.NewPassword` rejects longer ones with a 422.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from fastapi import Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .db import get_session
from .errors import AppError
from .models import User

PASSWORD_MAX_BYTES = 72  # bcrypt's input limit
PASSWORD_MIN_LEN = 8

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(plain: str) -> str:
    if len(plain.encode("utf-8")) > PASSWORD_MAX_BYTES:
        raise ValueError(f"password exceeds bcrypt's {PASSWORD_MAX_BYTES}-byte limit")
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        # Malformed hash in DB — treat as auth failure rather than crashing.
        return False


def create_access_token(user: User, settings: Settings) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "ver": user.token_version,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=settings.jwt_expire_days)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def end_sessions(session: Session, user: User) -> None:
    """End every session of `user` so far: once this commits, the tokens
    issued until now are refused, and tokens made from `user` afterwards
    carry the new version.

    Incremented in SQL rather than read, changed and written, so two changes
    at once both count. The new value is read back before the commit, while
    this transaction holds SQLite's write lock, so no other change can come
    in between.
    """
    session.execute(
        update(User)
        .where(User.id == user.id)
        .values(token_version=User.token_version + 1)
        .execution_options(synchronize_session=False)
    )
    session.refresh(user, ["token_version"])


def _not_authenticated(message: str, headers: dict[str, str] | None = None) -> AppError:
    return AppError(status.HTTP_401_UNAUTHORIZED, "not_authenticated", message, headers=headers)


def _decode_token(token: str, settings: Settings) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise _not_authenticated("Token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise _not_authenticated("Invalid token") from exc


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> User:
    """FastAPI dependency: the active user the bearer token belongs to.

    A missing, invalid or expired token, a token of an ended session (see
    `end_sessions`), or an unknown or disabled account, is a 401
    `not_authenticated`.
    """
    if creds is None or creds.scheme.lower() != "bearer" or not creds.credentials:
        raise _not_authenticated("Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    payload = _decode_token(creds.credentials, settings)
    sub = payload.get("sub")
    if not sub:
        raise _not_authenticated("Invalid token")
    try:
        user_id = int(sub)
    except (TypeError, ValueError) as exc:
        raise _not_authenticated("Invalid token") from exc
    user = session.get(User, user_id)
    if user is None or not user.is_active:
        raise _not_authenticated("User not found")
    # Every token carries the account's session version; one without it is
    # not one this app issued.
    if payload.get("ver") != user.token_version:
        raise _not_authenticated("Session ended")
    return user


def get_user_by_email(session: Session, email: str) -> User | None:
    return session.scalars(select(User).where(User.email == email.lower())).first()
