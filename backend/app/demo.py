"""Opt-in synthetic demo resource bounds, not authentication or DDoS protection."""

import os
import time
from collections import deque
from dataclasses import dataclass
from threading import Lock

from fastapi import HTTPException
from starlette.responses import JSONResponse


@dataclass(frozen=True)
class DemoLimits:
    employees: int = 10_500
    history: int = 12_000
    writes: int = 30
    window_seconds: int = 60

    def __post_init__(self):
        if min(self.employees, self.history, self.writes, self.window_seconds) < 1:
            raise ValueError("Demo limits must be positive")


def configured_limits():
    mode = os.getenv("SALARY_DEMO_MODE", "0")
    if mode not in ("0", "1"):
        raise ValueError("SALARY_DEMO_MODE must be 0 or 1")
    return DemoLimits() if mode == "1" else None


def capacity(db, limits, employee_rows=0, history_rows=1):
    """Called inside BEGIN IMMEDIATE; concurrent reservations cannot race."""
    if limits is None:
        return
    employees = db.execute("SELECT COUNT(*) FROM employees").fetchone()[0]
    history = db.execute("SELECT COUNT(*) FROM salary_history").fetchone()[0]
    if employees + employee_rows > limits.employees or history + history_rows > limits.history:
        raise HTTPException(
            507, "Synthetic demo capacity reached. The operator must reset the demo."
        )


def remaining_capacity(db, limits):
    if limits is None:
        return None
    return min(
        limits.employees - db.execute("SELECT COUNT(*) FROM employees").fetchone()[0],
        limits.history - db.execute("SELECT COUNT(*) FROM salary_history").fetchone()[0],
    )


class DemoWriteThrottle:
    """Global bounded window, ignoring spoofable proxy headers. One process only.
    Restart clears throttle, not persisted row caps. Application-validation failures count too; safety-header rejects occur earlier.
    """

    def __init__(self, app, limits, clock=time.monotonic):
        self.app, self.limits, self.clock = app, limits, clock
        self.attempts = deque()
        self.lock = Lock()

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["method"] not in ("GET", "HEAD", "OPTIONS"):
            now = self.clock()
            with self.lock:
                while self.attempts and self.attempts[0] <= now - self.limits.window_seconds:
                    self.attempts.popleft()
                allowed = len(self.attempts) < self.limits.writes
                if allowed:
                    self.attempts.append(now)
            if not allowed:
                await JSONResponse(
                    {"detail": "Synthetic demo write limit reached. Please retry shortly."},
                    status_code=429,
                    headers={"Retry-After": str(self.limits.window_seconds)},
                )(scope, receive, send)
                return
        await self.app(scope, receive, send)
