"""HTTP composition for the synthetic salary-management demonstration.

Routes handle transport and transaction boundaries; service.py owns business
rules and SQL operations. Request database work is synchronous and runs through
FastAPI's worker pool. One SQLite connection belongs to one request, even when
dependency setup, route execution and cleanup resume on different threads.
There is deliberately no authentication: this application is for fictional data.
"""

import os
import sqlite3
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi import Path as ApiPath
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from . import service
from .database import connect, initialize
from .demo import DemoWriteThrottle, capacity, configured_limits, remaining_capacity
from .domain import CURRENCY_DECIMALS, CSVImport, EmployeeInput, EmployeeUpdate, StatusChange, money
from .middleware import MAX_BODY_BYTES, BodySizeLimitMiddleware


def create_app(database_path=None, *, demo_limits=None):
    """Build an isolated app using a supplied DB path or the SALARY_DB setting.

    Explicit DemoLimits are useful in tests; otherwise SALARY_DEMO_MODE controls
    opt-in public-demo caps. The default local database is relative to this module,
    not the shell's working directory. Schema creation never seeds employee rows.
    """
    limits = demo_limits if demo_limits is not None else configured_limits()
    path = database_path or os.getenv(
        "SALARY_DB", str(Path(__file__).parents[1] / "data" / "salary.sqlite3")
    )
    initialize(path)
    app = FastAPI(
        title="ACME Salary Management",
        version="1.0.0",
        description="Synthetic data demo. Do not enter real employee data.",
    )

    # Starlette wraps middleware in reverse registration order: safety headers
    # run outside the throttle, which runs outside bounded body collection.
    app.add_middleware(BodySizeLimitMiddleware)
    if limits is not None:
        app.add_middleware(DemoWriteThrottle, limits=limits)

    @app.middleware("http")
    async def safety_headers(request: Request, call_next):
        """Reject impossible lengths early and keep salary responses out of caches."""
        length = request.headers.get("content-length", "0")
        # HTTP length is ASCII digits. Compare normalized decimal text before
        # int conversion so an enormous header cannot become a Python 500 error.
        normalized = length.lstrip("0") or "0"
        maximum = str(MAX_BODY_BYTES)
        if not length or not length.isascii() or not length.isdigit():
            response = JSONResponse({"detail": "Invalid content length"}, status_code=400)
        elif len(normalized) > len(maximum) or (
            len(normalized) == len(maximum) and normalized > maximum
        ):
            response = JSONResponse({"detail": "Request exceeds 5 MB limit"}, status_code=413)
        else:
            response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    def database():
        """Commit a successful request, or roll back its employee AND audit writes.

        Routes use Depends(..., scope="function") so cleanup, including a possible
        commit failure, occurs before a successful response is sent. Explicit
        close is essential: SQLite's transaction context alone does not close.
        """
        db = connect(path)
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def query_filters(
        q: str = Query("", max_length=120),
        country: str = Query("", max_length=120),
        department: str = Query("", max_length=120),
        currency: str = Query("", max_length=3),
        status: Literal["active", "archived", "all"] = "active",
    ):
        """Validate public filter inputs once for list, export and analytics parity."""
        return service.filters(q.strip(), country, department, currency, status)

    @app.exception_handler(sqlite3.OperationalError)
    async def database_busy(request, error):
        """Hide internal SQL/path details and expose operational failures as 503.

        OperationalError includes more than lock contention; the response avoids
        claiming a specific failure cause that this handler has not diagnosed.
        """
        return JSONResponse(
            {"detail": "Database temporarily unavailable. Try again."}, status_code=503
        )

    @app.get("/api/health")
    def health(db=Depends(database, scope="function")):
        """Verify a database round trip and disclose which demo limits are active."""
        db.execute("SELECT 1")
        return {
            "status": "ok",
            "mode": "synthetic-demo",
            "demo_limits_enabled": limits is not None,
            "limits": vars(limits) if limits else None,
        }

    @app.get("/api/options")
    def options(db=Depends(database, scope="function")):
        """Return stored location/team labels plus the supported currency allowlist.

        Archived rows remain in the options so an archive-only filter is usable.
        """
        return {
            "countries": [
                r[0] for r in db.execute("SELECT DISTINCT country FROM employees ORDER BY country")
            ],
            "departments": [
                r[0]
                for r in db.execute("SELECT DISTINCT department FROM employees ORDER BY department")
            ],
            "currencies": list(CURRENCY_DECIMALS),
        }

    @app.get("/api/employees/export.csv")
    def export(parameters=Depends(query_filters), db=Depends(database, scope="function")):
        """Export all filtered rows, not just the visible page, as a safe CSV report."""
        where, values = parameters
        rows = db.execute(
            "SELECT * FROM employees" + where + " ORDER BY name COLLATE NOCASE,id", values
        ).fetchall()
        return Response(
            service.export_csv(rows),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="acme-salaries.csv"'},
        )

    @app.post("/api/employees/import", status_code=201)
    def import_employees(body: CSVImport, db=Depends(database, scope="function")):
        """Create a whole CSV batch or none of it, including its initial audit rows."""
        # Acquire the writer reservation before counting capacity or checking
        # existing state; otherwise two writes could both observe the same space.
        db.execute("BEGIN IMMEDIATE")
        return {
            "created": service.import_csv(db, body.csv, capacity=remaining_capacity(db, limits))
        }

    @app.get("/api/employees")
    def employees(
        page: int = Query(1, ge=1, le=1_000_000),
        page_size: int = Query(25, ge=1, le=100),
        parameters=Depends(query_filters),
        db=Depends(database, scope="function"),
    ):
        """Return a stable name/id ordered page and a matching filtered total.

        Both queries share one read snapshot. Separate HTTP page requests can
        still reflect intervening writes; pagination is not a long-lived snapshot.
        """
        where, values = parameters
        # One read transaction makes count and page mutually consistent.
        db.execute("BEGIN")
        total = db.execute("SELECT COUNT(*) FROM employees" + where, values).fetchone()[0]
        rows = db.execute(
            "SELECT * FROM employees" + where + " ORDER BY name COLLATE NOCASE,id LIMIT ? OFFSET ?",
            values + [page_size, (page - 1) * page_size],
        ).fetchall()
        return {
            "items": [service.serialize(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    @app.post("/api/employees", status_code=201)
    def create(body: EmployeeInput, db=Depends(database, scope="function")):
        """Reserve one employee and one history slot, then return the new record."""
        db.execute("BEGIN IMMEDIATE")
        capacity(db, limits, employee_rows=1)
        return service.create_employee(db, body)

    @app.put("/api/employees/{identifier}")
    def update(
        identifier: Annotated[int, ApiPath(ge=1, le=9_223_372_036_854_775_807)],
        body: EmployeeUpdate,
        db=Depends(database, scope="function"),
    ):
        """Apply a complete edit only if its optimistic version is still current."""
        db.execute("BEGIN IMMEDIATE")
        capacity(db, limits)
        return service.update_employee(db, identifier, body)

    @app.post("/api/employees/{identifier}/archive")
    def archive(
        identifier: Annotated[int, ApiPath(ge=1, le=9_223_372_036_854_775_807)],
        body: StatusChange,
        db=Depends(database, scope="function"),
    ):
        """Hide an employee from active lists while preserving all data and history."""
        db.execute("BEGIN IMMEDIATE")
        capacity(db, limits)
        return service.change_status(db, identifier, body, "archived")

    @app.post("/api/employees/{identifier}/restore")
    def restore(
        identifier: Annotated[int, ApiPath(ge=1, le=9_223_372_036_854_775_807)],
        body: StatusChange,
        db=Depends(database, scope="function"),
    ):
        """Return an archived employee to active lists with a new auditable version."""
        db.execute("BEGIN IMMEDIATE")
        capacity(db, limits)
        return service.change_status(db, identifier, body, "active")

    @app.get("/api/employees/{identifier}/history")
    def history(
        identifier: Annotated[int, ApiPath(ge=1, le=9_223_372_036_854_775_807)],
        db=Depends(database, scope="function"),
    ):
        """Return newest-first audit events, formatting each side in its own currency.

        A creation event has no old salary. A currency change must not accidentally
        render the old integer amount using the new currency's decimal places.
        """
        service.get_employee(db, identifier)
        rows = db.execute(
            "SELECT * FROM salary_history WHERE employee_id=? ORDER BY id DESC", (identifier,)
        ).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            old, new = item.pop("old_salary_minor"), item.pop("new_salary_minor")
            item["old_salary"] = money(old, item["old_currency"]) if old is not None else None
            item["new_salary"] = money(new, item["new_currency"])
            result.append(item)
        return {"items": result}

    @app.get("/api/analytics")
    def analytics(
        group_by: Literal["currency", "country", "department"] = "currency",
        parameters=Depends(query_filters),
        db=Depends(database, scope="function"),
    ):
        """Aggregate the same filter set without adding unlike currencies together."""
        return service.analytics(db, *parameters, group_by)

    # Built React assets share the API origin, avoiding a production CORS setup.
    # Development uses Vite's /api proxy; a missing build is an explicit 503.
    dist = Path(__file__).parents[2] / "frontend" / "dist"
    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/", include_in_schema=False)
    def index():
        """Serve the built single-page UI, with a useful error before the first build."""
        if not (dist / "index.html").is_file():
            raise HTTPException(
                503, "Frontend is not built. Run npm ci && npm run build in frontend."
            )
        return FileResponse(dist / "index.html")

    return app


# Uvicorn imports this object; tests call the factory with disposable file paths.
app = create_app()
