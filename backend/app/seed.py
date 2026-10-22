"""Deterministic, idempotent seed. No external source or real employee data."""

import argparse
import os
from pathlib import Path

from .database import connect, initialize

LOCATIONS = [
    ("India", "INR", 180000000),
    ("United States", "USD", 11000000),
    ("United Kingdom", "GBP", 7500000),
    ("Germany", "EUR", 8500000),
    ("Japan", "JPY", 9000000),
]
DEPARTMENTS = [
    ("Engineering", "Software Engineer"),
    ("Product", "Product Manager"),
    ("Operations", "Operations Analyst"),
    ("People", "HR Specialist"),
    ("Finance", "Financial Analyst"),
]


def seed(path: str, count: int = 10000) -> int:
    if not 1 <= count <= 100000:
        raise ValueError("Count must be between 1 and 100,000")
    initialize(path)
    added = 0
    with connect(path) as db:
        for i in range(1, count + 1):
            country, currency, base = LOCATIONS[(i - 1) % len(LOCATIONS)]
            department, title = DEPARTMENTS[((i - 1) // 5) % len(DEPARTMENTS)]
            amount = base + ((i * 7919) % max(1, base // 2))
            cursor = db.execute(
                """INSERT OR IGNORE INTO employees
              (employee_code,name,department,job_title,country,currency,salary_minor,effective_date)
              VALUES (?,?,?,?,?,?,?,?)""",
                (
                    f"DEMO-{i:05}",
                    f"Demo Employee {i:05}",
                    department,
                    title,
                    country,
                    currency,
                    amount,
                    "2026-01-01",
                ),
            )
            if cursor.rowcount:
                added += 1
                db.execute(
                    """INSERT INTO salary_history
                  (employee_id,new_salary_minor,new_currency,effective_date,reason,event,changed_at)
                  VALUES (?,?,?,?,?,?,?)""",
                    (
                        cursor.lastrowid,
                        amount,
                        currency,
                        "2026-01-01",
                        "Synthetic seed baseline",
                        "created",
                        "2026-01-01T00:00:00.000Z",
                    ),
                )
    return added


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--database",
        default=os.getenv("SALARY_DB", str(Path(__file__).parents[1] / "data" / "salary.sqlite3")),
    )
    parser.add_argument("--count", type=int, default=10000)
    args = parser.parse_args()
    print(f"Created {seed(args.database, args.count):,} synthetic employees.")
