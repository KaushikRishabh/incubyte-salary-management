"""Opt-in resource bounds for a publicly reachable fictional-data demonstration.

Persisted row caps bound dataset growth, while a process-local rolling window
slows mutation attempts. Neither mechanism authenticates users, isolates tenants
or substitutes for infrastructure-level abuse protection. Never use real payroll
data here. A deployment must run exactly one application worker for this throttle.
"""

import os
import time
from collections import deque
from dataclasses import dataclass
from threading import Lock

from fastapi import HTTPException
from starlette.responses import JSONResponse


@dataclass(frozen=True)
class DemoLimits:
    """Immutable budgets, leaving room above the 10,000-row synthetic baseline.

    Employees includes archived rows; every mutation consumes a history row.
    There is no HTTP delete/reset mechanism that could reclaim either budget.
    """

    employees: int = 10_500
    history: int = 12_000
    writes: int = 30
    window_seconds: int = 60

    def __post_init__(self):
        """Reject unusable settings immediately rather than silently blocking all work."""
        if min(self.employees, self.history, self.writes, self.window_seconds) < 1:
            raise ValueError("Demo limits must be positive")


def configured_limits():
    """Resolve the explicit environment opt-in; fail closed on a misspelled value."""
    mode = os.getenv("SALARY_DEMO_MODE", "0")
    if mode not in ("0", "1"):
        raise ValueError("SALARY_DEMO_MODE must be 0 or 1")
    return DemoLimits() if mode == "1" else None


def capacity(db, limits, employee_rows=0, history_rows=1):
    """Raise HTTP 507 if a proposed mutation exceeds a persisted row budget.

    Called inside BEGIN IMMEDIATE so concurrent capacity checks cannot race.
    Updates/status changes default to one history row and zero employee rows.
    None disables caps for local development without changing business rules.
    """
    if limits is None:
        return
    employees = db.execute("SELECT COUNT(*) FROM employees").fetchone()[0]
    history = db.execute("SELECT COUNT(*) FROM salary_history").fetchone()[0]
    if employees + employee_rows > limits.employees or history + history_rows > limits.history:
        raise HTTPException(
            507, "Synthetic demo capacity reached. The operator must reset the demo."
        )


def remaining_capacity(db, limits):
    """Count importable employee/history pairs inside the same writer reservation."""
    if limits is None:
        return None
    return min(
        limits.employees - db.execute("SELECT COUNT(*) FROM employees").fetchone()[0],
        limits.history - db.execute("SELECT COUNT(*) FROM salary_history").fetchone()[0],
    )


class DemoWriteThrottle:
    """Global bounded window, ignoring spoofable proxy headers. One process only.

    Restart clears this throttle, not persisted row caps. Application-validation
    failures count too; safety-header rejects occur earlier. Denied attempts are
    not retained, so the deque can never grow above the write-attempt budget.
    """

    def __init__(self, app, limits, clock=time.monotonic):
        """Inject a monotonic clock so tests can advance windows without sleeping."""
        self.app, self.limits, self.clock = app, limits, clock
        self.attempts = deque()
        self.lock = Lock()

    async def __call__(self, scope, receive, send):
        """Admit safe reads unconditionally; reserve a slot before any write parsing."""
        if scope["type"] == "http" and scope["method"] not in ("GET", "HEAD", "OPTIONS"):
            with self.lock:
                # Read time under the same lock as append: concurrent ASGI calls
                # must keep timestamps ordered for oldest-first eviction.
                now = self.clock()
                while self.attempts and self.attempts[0] <= now - self.limits.window_seconds:
                    self.attempts.popleft()
                allowed = len(self.attempts) < self.limits.writes
                if allowed:
                    self.attempts.append(now)
            if not allowed:
                # A full window is a conservative Retry-After, not a promise that
                # another caller cannot consume the next available write slot.
                await JSONResponse(
                    {"detail": "Synthetic demo write limit reached. Please retry shortly."},
                    status_code=429,
                    headers={"Retry-After": str(self.limits.window_seconds)},
                )(scope, receive, send)
                return
        await self.app(scope, receive, send)
