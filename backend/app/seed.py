"""Deterministic, idempotent fictional employee data for demos and verification.

The same code always maps to the same baseline profile/salary. Existing rows are
never overwritten, so restarting after user edits preserves those changes. This
is an operator CLI utility, not a publicly accessible import or reset endpoint.
"""

import argparse
import os
from contextlib import closing
from pathlib import Path

from .database import connect, initialize

# Baseline amounts are already minor units: INR/USD/EUR/GBP use hundredths,
# whereas JPY is whole yen. These are sample numbers, not market-salary research.
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
    """Ensure codes DEMO-00001..count exist, returning newly inserted rows only.

    One transaction couples each employee with its initial audit event. A fixed
    baseline date and arithmetic variation make repeated runs reproducible,
    without random-number seeds, network calls or identifying information.
    """
    if not 1 <= count <= 100000:
        raise ValueError("Count must be between 1 and 100,000")
    initialize(path)
    added = 0
    with closing(connect(path)) as db, db:
        for i in range(1, count + 1):
            # Cycle country/currency fastest and department every five records,
            # distributing the baseline across all location/department pairs.
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
                # INSERT OR IGNORE reports zero for existing employee codes;
                # create history only for genuinely new rows to stay idempotent.
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
    # SALARY_DB keeps startup seeding and the API pointed at the same persisted
    # file; an explicit --database takes precedence for test/reset preparation.
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--database",
        default=os.getenv("SALARY_DB", str(Path(__file__).parents[1] / "data" / "salary.sqlite3")),
    )
    parser.add_argument("--count", type=int, default=10000)
    args = parser.parse_args()
    print(f"Created {seed(args.database, args.count):,} synthetic employees.")
