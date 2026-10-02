"""Sliding-window limiter: a budget per client, and memory that does not grow
with every client ever seen."""

from __future__ import annotations

from app.ratelimit import SlidingWindowLimiter


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_budget_per_client_and_retry_after():
    clock = FakeClock()
    limiter = SlidingWindowLimiter(window_seconds=60, clock=clock)

    assert [limiter.check("a", 3) for _ in range(3)] == [None, None, None]
    wait = limiter.check("a", 3)
    assert wait is not None and 0 < wait <= 60
    assert limiter.check("b", 3) is None  # other clients keep their budget

    clock.now += 61
    assert limiter.check("a", 3) is None  # the window has passed


def test_idle_clients_are_forgotten():
    clock = FakeClock()
    limiter = SlidingWindowLimiter(window_seconds=60, clock=clock)
    for i in range(5000):
        limiter.check(f"ip-{i}", 10)
    assert len(limiter) == 5000

    clock.now += 121  # two windows later
    limiter.check("new", 10)
    assert len(limiter) == 1


def test_active_clients_survive_pruning():
    clock = FakeClock()
    limiter = SlidingWindowLimiter(window_seconds=60, clock=clock)
    limiter.check("busy", 2)
    limiter.check("idle", 2)

    clock.now += 50
    limiter.check("busy", 2)  # second hit, 50 s after the first
    clock.now += 20  # first hit left the window, the second is still in it
    assert limiter.check("busy", 2) is None
    assert limiter.check("busy", 2) is not None  # budget of 2 inside 60 s
    assert len(limiter) == 1  # "idle" was pruned
