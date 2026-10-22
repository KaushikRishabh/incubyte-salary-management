"""Business operations over validated inputs and caller-owned SQLite connections.

Functions never commit: the HTTP dependency owns commit/rollback. Before any
write, callers must start BEGIN IMMEDIATE so version/capacity checks and resulting
writes share a serialized transaction. Every successful mutation adds an audit
event atomically; exceptions leave rollback to the caller. Read helpers accept
the same connection without requiring a writer transaction.
"""

import csv
import io
import sqlite3
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException
from pydantic import ValidationError

from .domain import CURRENCY_DECIMALS, EmployeeInput, minor_units, money

# Ordered, create-only import contract. Export deliberately omits reason and adds
# status/version, so a report cannot accidentally be re-imported as new employees.
FIELDS = [
    "employee_code",
    "name",
    "department",
    "job_title",
    "country",
    "currency",
    "annual_salary",
    "effective_date",
    "reason",
]


def serialize(row):
    """Copy a DB row to a JSON-ready mapping without exposing internal money units."""
    data = dict(row)
    data["annual_salary"] = money(data.pop("salary_minor"), data["currency"])
    return data


def filters(q="", country="", department="", currency="", status="active"):
    """Return (SQL WHERE fragment, bound values) shared by all reporting endpoints.

    Column names come only from this function; caller-provided values are never
    interpolated into SQL. HTTP validation supplies the supported status values.
    """
    clauses, values = [], []
    if status != "all":
        clauses.append("status = ?")
        values.append(status)
    for field, value in [("country", country), ("department", department), ("currency", currency)]:
        if value:
            clauses.append(field + " = ?")
            values.append(value)
    if q:
        # Treat user search literally, including SQL LIKE wildcards.
        literal = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        clauses.append("(name LIKE ? ESCAPE '\\' OR employee_code LIKE ? ESCAPE '\\')")
        values.extend(["%" + literal + "%"] * 2)
    return (" WHERE " + " AND ".join(clauses) if clauses else ""), values


def get_employee(db, identifier):
    """Fetch active or archived state by primary key, or raise the public 404."""
    row = db.execute("SELECT * FROM employees WHERE id=?", (identifier,)).fetchone()
    if row is None:
        raise HTTPException(404, "Employee not found")
    return row


def amount_for(data):
    """Bridge currency-aware money validation to a consistent HTTP 422 response."""
    try:
        return minor_units(data.annual_salary, data.currency)
    except ValueError as error:
        raise HTTPException(422, str(error)) from None


def record(db, identifier, old, new, event, reason):
    """Append one audit row in the caller's transaction, without committing it.

    Creation supplies old=None. Archive/restore retain the current salary/date
    and explain the status event; changed_at records when the event was written.
    This is a salary/event audit, not a before/after snapshot of every profile field.
    """
    db.execute(
        """INSERT INTO salary_history
        (employee_id,old_salary_minor,new_salary_minor,old_currency,new_currency,effective_date,reason,event)
        VALUES (?,?,?,?,?,?,?,?)""",
        (
            identifier,
            old["salary_minor"] if old else None,
            new["salary_minor"],
            old["currency"] if old else None,
            new["currency"],
            new["effective_date"],
            reason,
            event,
        ),
    )


def create_employee(db, data):
    """Insert validated employee state and initial history, returning public fields.

    Input validation covers the other schema constraints; the unique employee
    code is the expected integrity conflict and is exposed as HTTP 409.
    """
    units = amount_for(data)
    try:
        cursor = db.execute(
            """INSERT INTO employees
          (employee_code,name,department,job_title,country,currency,salary_minor,effective_date)
          VALUES (?,?,?,?,?,?,?,?)""",
            (
                data.employee_code,
                data.name,
                data.department,
                data.job_title,
                data.country,
                data.currency,
                units,
                data.effective_date.isoformat(),
            ),
        )
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Employee code already exists") from None
    row = get_employee(db, cursor.lastrowid)
    record(db, row["id"], None, row, "created", data.reason)
    return serialize(row)


def update_employee(db, identifier, data):
    """Replace editable fields, increment the version and record both salary values.

    The writer reservation protects the read/check/write sequence; the WHERE
    version predicate additionally states its optimistic-concurrency invariant.
    Employee identity is immutable and effective dates may stay equal or advance.
    """
    old = get_employee(db, identifier)
    if old["version"] != data.version:
        raise HTTPException(409, "This employee changed. Refresh before editing again.")
    if old["status"] != "active":
        raise HTTPException(409, "Restore archived employees before editing.")
    if old["employee_code"] != data.employee_code:
        raise HTTPException(422, "Employee code cannot be changed")
    if data.effective_date.isoformat() < old["effective_date"]:
        raise HTTPException(422, "Effective date cannot precede the current salary date")
    units = amount_for(data)
    db.execute(
        """UPDATE employees SET name=?,department=?,job_title=?,country=?,currency=?,
      salary_minor=?,effective_date=?,version=version+1 WHERE id=? AND version=?""",
        (
            data.name,
            data.department,
            data.job_title,
            data.country,
            data.currency,
            units,
            data.effective_date.isoformat(),
            identifier,
            data.version,
        ),
    )
    row = get_employee(db, identifier)
    record(db, identifier, old, row, "updated", data.reason)
    return serialize(row)


def change_status(db, identifier, change, target):
    """Archive/restore with optimistic locking, rejecting duplicate transitions.

    Only the fixed API routes provide target ('active' or 'archived'); it is not
    accepted as arbitrary client input. A status change does not rewrite salary.
    """
    old = get_employee(db, identifier)
    if old["version"] != change.version:
        raise HTTPException(409, "This employee changed. Refresh before trying again.")
    if old["status"] == target:
        raise HTTPException(409, f"Employee is already {target}")
    db.execute("UPDATE employees SET status=?,version=version+1 WHERE id=?", (target, identifier))
    row = get_employee(db, identifier)
    record(
        db, identifier, old, row, "archived" if target == "archived" else "restored", change.reason
    )
    return serialize(row)


def import_csv(db, content, capacity=None):
    """Validate the entire create-only CSV, then insert all rows transactionally.

    Accept an optional UTF-8 BOM but require the exact header/order. Two-phase
    parsing avoids writes for shape/validation errors. Database conflicts can
    still occur during insertion; the caller must roll back the whole batch.
    capacity is the number of additional employee/history pairs the demo allows.
    """
    reader = csv.DictReader(io.StringIO(content.lstrip("\ufeff")), strict=True)
    try:
        if reader.fieldnames != FIELDS:
            raise HTTPException(422, "CSV header must be: " + ",".join(FIELDS))
    except csv.Error:
        raise HTTPException(422, "Malformed CSV header") from None
    rows, seen = [], set()
    try:
        # Record numbering starts after the header; quoted multiline fields make
        # this a logical record number rather than a physical source-line number.
        for index, row in enumerate(reader, 2):
            if len(rows) >= 10000:
                raise HTTPException(422, "Import is limited to 10,000 employees")
            if None in row or None in row.values():
                raise HTTPException(422, f"Row {index}: wrong number of columns")
            try:
                data = EmployeeInput(**row)
                amount_for(data)
            except (ValidationError, HTTPException) as error:
                message = str(error) if isinstance(error, ValidationError) else error.detail
                raise HTTPException(422, f"Row {index}: {message}") from None
            code = data.employee_code.lower()
            if code in seen:
                raise HTTPException(422, f"Row {index}: duplicate employee code")
            seen.add(code)
            rows.append(data)
    except csv.Error:
        raise HTTPException(422, "Malformed CSV") from None
    if not rows:
        raise HTTPException(422, "CSV contains no employee rows")
    if capacity is not None and len(rows) > capacity:
        raise HTTPException(
            507, "Synthetic demo capacity reached. The operator must reset the demo."
        )
    for data in rows:
        create_employee(db, data)
    return len(rows)


def csv_safe(value):
    """Prefix formula-like cells so opening a report does not execute a formula.

    The leading apostrophe intentionally changes exported report text. Check
    through whitespace too, because spreadsheet applications may ignore it.
    """
    text = str(value)
    return "'" + text if text.lstrip().startswith(("=", "+", "-", "@")) else text


def export_csv(rows):
    """Serialize filtered DB rows as a human-readable, formula-escaped CSV string."""
    out = io.StringIO(newline="")
    writer = csv.writer(out)
    # Export is a human report, not the create-only import format.
    writer.writerow(FIELDS[:-1] + ["status", "version"])
    for row in rows:
        item = serialize(row)
        writer.writerow([csv_safe(item[field]) for field in FIELDS[:-1] + ["status", "version"]])
    return out.getvalue()


def analytics(db, where, args, group_by):
    """Return per-currency aggregates and total headcount for a trusted filter.

    Dimension identifiers are chosen from a fixed mapping, never raw SQL input.
    SQLite sums integer minor units; Decimal calculates the average, rounding
    half up only for display. Even country/department groups retain currency as
    a second key because this demo has no exchange-rate or conversion model.
    """
    dimension = {"currency": "currency", "country": "country", "department": "department"}[group_by]
    rows = db.execute(
        f"""SELECT {dimension} AS label,currency,COUNT(*) AS n,
      SUM(salary_minor) AS total,MIN(salary_minor) AS minimum,MAX(salary_minor) AS maximum
      FROM employees{where} GROUP BY {dimension},currency ORDER BY {dimension},currency""",
        args,
    ).fetchall()
    groups = []
    for row in rows:
        currency = row["currency"]
        digits = CURRENCY_DECIMALS[currency]
        average = (Decimal(row["total"]) / row["n"] / (10**digits)).quantize(
            Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP
        )
        groups.append(
            {
                "group": row["label"],
                "currency": currency,
                "headcount": row["n"],
                "total_salary": money(row["total"], currency),
                "average_salary": str(average),
                "min_salary": money(row["minimum"], currency),
                "max_salary": money(row["maximum"], currency),
            }
        )
    return {"groups": groups, "headcount": sum(row["n"] for row in rows)}
