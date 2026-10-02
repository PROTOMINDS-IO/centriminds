"""What the project routers share: finding the signed-in user's project, and
the errors of reading a project's stored `.odx`."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..analysis.spectrogram import SpectrogramNotFoundError
from ..errors import AppError
from ..io.odx_parser import OdxParseError
from ..models import Project, User

#: What loading a project's stored `.odx` can raise; see `stored_odx_error`.
STORED_ODX_ERRORS = (SpectrogramNotFoundError, OdxParseError)


def require_project(project_id: int, session: Session, current_user: User) -> Project:
    """The user's project, or a 404."""
    project = session.get(Project, project_id)
    if project is None or project.user_id != current_user.id:
        # 404, not 403: the reply must not reveal that another user's
        # project exists.
        raise AppError(404, "project_not_found", "Project not found")
    return project


def stored_odx_error(exc: SpectrogramNotFoundError | OdxParseError) -> AppError:
    """The API error for a stored `.odx` that is missing or cannot be read."""
    if isinstance(exc, SpectrogramNotFoundError):
        return AppError(
            404, "odx_missing", "Project record exists but its .odx file is missing on disk"
        )
    return AppError(
        500, "odx_corrupt", f"Stored .odx is corrupt: {exc}", params={"reason": str(exc)}
    )
