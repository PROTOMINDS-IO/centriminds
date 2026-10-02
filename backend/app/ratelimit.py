"""In-memory sliding-window rate limiting for the auth endpoints.

One process serves the API (single EC2 instance), so a process-local limiter
is exact; a multi-instance deployment would move the counters to a shared
store behind the same interface.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable

from fastapi import Depends, Request, status

from .config import Settings, get_settings
from .errors import AppError

WINDOW_SECONDS = 60.0


class SlidingWindowLimiter:
    def __init__(
        self,
        window_seconds: float = WINDOW_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._window = window_seconds
        self._clock = clock
        self._hits: defaultdict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()
        self._next_prune = 0.0

    def check(self, key: str, limit: int) -> float | None:
        """Record a hit; return seconds to wait if `key` is over `limit`."""
        now = self._clock()
        with self._lock:
            if now >= self._next_prune:
                self._prune(now)
            hits = self._hits[key]
            while hits and now - hits[0] > self._window:
                hits.popleft()
            if len(hits) >= limit:
                return self._window - (now - hits[0])
            hits.append(now)
            return None

    def _prune(self, now: float) -> None:
        """Forget clients with no hit inside the window (once per window), so
        memory stays bounded by the clients seen in the last two windows."""
        for key in [k for k, v in self._hits.items() if not v or now - v[-1] > self._window]:
            del self._hits[key]
        self._next_prune = now + self._window

    def __len__(self) -> int:
        return len(self._hits)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
            self._next_prune = 0.0


auth_limiter = SlidingWindowLimiter()


def client_ip(request: Request) -> str:
    # Uvicorn runs with --proxy-headers behind nginx/Caddy, so this is the
    # real client address, not the proxy's.
    return request.client.host if request.client else "unknown"


def limit_auth_attempts(request: Request, settings: Settings = Depends(get_settings)) -> None:
    """FastAPI dependency: 429 once a client exceeds the per-minute budget."""
    wait = auth_limiter.check(f"auth:{client_ip(request)}", settings.auth_attempts_per_minute)
    if wait is not None:
        retry_after = max(1, round(wait))
        raise AppError(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "rate_limited",
            "Too many attempts. Please wait a minute and try again.",
            params={"retry_after": retry_after},
            headers={"Retry-After": str(retry_after)},
        )
