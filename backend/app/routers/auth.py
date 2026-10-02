"""Auth endpoints: config / register / login / me (read, update, password,
sessions).

The token returned by `/login` and `/register` is a JWT — clients store it
and send it as `Authorization: Bearer <token>` on every authenticated
request. There is no refresh endpoint; the SPA re-prompts on expiry. A
password change ends the account's other sessions and returns a new token
for the one that asked; `DELETE /me/sessions` ends them all (see
`auth.end_sessions`).
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, status
from sqlalchemy import func, update
from sqlalchemy.orm import Session

from ..auth import (
    create_access_token,
    end_sessions,
    get_current_user,
    get_user_by_email,
    hash_password,
    verify_password,
)
from ..config import Settings, get_settings
from ..db import get_session
from ..errors import AppError
from ..models import User
from ..ratelimit import limit_auth_attempts
from ..schemas import (
    LoginRequest,
    PasswordChange,
    TokenResponse,
    UserCreate,
    UserRead,
    UserUpdate,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/config")
def auth_config(settings: Settings = Depends(get_settings)) -> dict[str, bool]:
    """Public: lets the sign-in screen hide sign-up when it is switched off."""
    return {"allow_registration": settings.allow_registration}


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=201,
    dependencies=[Depends(limit_auth_attempts)],
)
def register(
    body: UserCreate,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> TokenResponse:
    if not settings.allow_registration:
        raise AppError(
            status.HTTP_403_FORBIDDEN, "registration_disabled", "Registration is disabled"
        )
    email = body.email.lower()
    # Before the duplicate check, so an uninvited address learns nothing
    # about which accounts exist.
    if settings.registration_emails and email not in settings.registration_emails:
        raise AppError(
            status.HTTP_403_FORBIDDEN, "not_invited", "This email address is not invited to sign up"
        )
    if get_user_by_email(session, email) is not None:
        raise AppError(409, "email_taken", "Email already registered")
    user = User(
        email=email,
        name=body.name,
        password_hash=hash_password(body.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    token = create_access_token(user, settings)
    return TokenResponse(access_token=token, user=UserRead.model_validate(user))


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(limit_auth_attempts)])
def login(
    body: LoginRequest,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> TokenResponse:
    user = get_user_by_email(session, body.email)
    if user is None or not verify_password(body.password, user.password_hash):
        # One message for both cases, so the reply does not say whether the
        # email has an account.
        raise AppError(401, "invalid_credentials", "Invalid email or password")
    if not user.is_active:
        raise AppError(403, "account_disabled", "Account disabled")
    token = create_access_token(user, settings)
    return TokenResponse(access_token=token, user=UserRead.model_validate(user))


def _refuse_demo_account(user: User, settings: Settings) -> None:
    """The shared demo login is used by many visitors at once: none of them
    may change what lets the others in (password, sessions) or its name."""
    if settings.demo_email and user.email == settings.demo_email:
        raise AppError(403, "demo_account_locked", "The demo account cannot be changed")


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)) -> UserRead:
    return UserRead.model_validate(current_user)


@router.patch("/me", response_model=UserRead)
def update_me(
    body: UserUpdate,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> UserRead:
    """Rename, and/or change the settings keys sent (the others are kept)."""
    if body.name is not None:
        _refuse_demo_account(current_user, settings)
        current_user.name = body.name
    if body.settings is not None:
        # Merged by SQLite (RFC 7396 merge patch) rather than read-modify-write:
        # the web app saves each change as it is made, so requests for
        # different keys can overlap. A null removes the key: it reads as the
        # default (for auto_rotate, the device default).
        session.execute(
            update(User)
            .where(User.id == current_user.id)
            .values(settings=func.json_patch(User.settings, json.dumps(body.settings.changes())))
            .execution_options(synchronize_session=False)
        )
    session.commit()
    session.refresh(current_user)
    return UserRead.model_validate(current_user)


@router.post(
    "/me/password",
    response_model=TokenResponse,
    dependencies=[Depends(limit_auth_attempts)],  # it checks a password
)
def change_password(
    body: PasswordChange,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> TokenResponse:
    """Set a new password and end every session of the account, so whoever
    signed in with the old password is signed out. The device that changed
    it carries on with the token returned."""
    _refuse_demo_account(current_user, settings)
    if not verify_password(body.current_password, current_user.password_hash):
        raise AppError(400, "wrong_password", "Current password is incorrect")
    current_user.password_hash = hash_password(body.new_password)
    end_sessions(session, current_user)
    session.commit()
    token = create_access_token(current_user, settings)
    return TokenResponse(access_token=token, user=UserRead.model_validate(current_user))


@router.delete("/me/sessions", status_code=status.HTTP_204_NO_CONTENT)
def sign_out_everywhere(
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> None:
    """End every session of the account, the one asking included.

    Unlike a password change it keeps none, and it asks for no password: a
    stolen token can use it only to end itself along with the others.
    """
    _refuse_demo_account(current_user, settings)
    end_sessions(session, current_user)
    session.commit()
