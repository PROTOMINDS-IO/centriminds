"""API errors with a machine-readable code, so clients can word them in any
language.

Every error the API raises on purpose is an `AppError`. Its JSON body keeps
the English `detail` that existing clients show, and adds a stable snake_case
`code` plus the `params` a translated message needs:

    {"detail": "File is larger than 100 MB", "code": "file_too_large", "params": {"max_mb": 100}}

FastAPI's own 422 request-validation responses keep their standard shape.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


class AppError(HTTPException):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=message, headers=headers)
        self.code = code
        self.message = message
        self.params = params or {}


async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        {"detail": exc.message, "code": exc.code, "params": exc.params},
        status_code=exc.status_code,
        headers=exc.headers,
    )
