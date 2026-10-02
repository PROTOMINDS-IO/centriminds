# syntax=docker/dockerfile:1

FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    DATA_DIR=/data

WORKDIR /srv

# The app writes only to /data (the database and uploads). Code and venv
# stay root-owned, so the process that serves requests cannot change them.
RUN useradd --system --uid 1000 --create-home appuser \
    && mkdir -p /data \
    && chown appuser:appuser /data

# Dependencies first (cached layer), exactly as locked in uv.lock. uv is
# mounted for this step only, so it is not shipped in the image (keep the
# pin in step with the Makefile and CI); its download cache persists
# between builds as a BuildKit cache mount.
COPY pyproject.toml uv.lock ./
RUN --mount=from=ghcr.io/astral-sh/uv:0.12.21,source=/uv,target=/bin/uv \
    --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .

USER appuser

EXPOSE 8000

# The one healthcheck for every Compose file. Migrations run before the API
# answers, which takes a while on a small instance: hence the start period,
# probed every 2 s so `docker compose up --wait` returns soon after. Python
# does the request: the slim image has neither curl nor wget.
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --start-interval=2s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)" || exit 1

# Migrations run at startup (app/db.py). Only the frontend's nginx reaches
# this port (it is not published), and nginx overwrites X-Forwarded-For and
# X-Forwarded-Proto on every request (frontend/nginx.conf), so trusting any
# proxy here means trusting nginx's word: the client IP the rate limits use
# is the one nginx saw, or the one a proxy nginx trusts reported.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips", "*"]
