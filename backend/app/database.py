"""Small explicit relational schema and connection lifecycle."""
import sqlite3
from pathlib import Path

SCHEMA = '''
CREATE TABLE IF NOT EXISTS employees (
 id INTEGER PRIMARY KEY,
 employee_code TEXT NOT NULL UNIQUE COLLATE NOCASE,
 name TEXT NOT NULL, department TEXT NOT NULL, job_title TEXT NOT NULL,
 country TEXT NOT NULL, currency TEXT NOT NULL CHECK(currency IN ('USD','EUR','GBP','INR','JPY')),
 salary_minor INTEGER NOT NULL CHECK(salary_minor > 0),
 effective_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE INDEX IF NOT EXISTS idx_employee_filters ON employees(status,currency,country,department);
CREATE INDEX IF NOT EXISTS idx_employee_name ON employees(name COLLATE NOCASE,id);
CREATE TABLE IF NOT EXISTS salary_history (
 id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id),
 old_salary_minor INTEGER, new_salary_minor INTEGER NOT NULL,
 old_currency TEXT, new_currency TEXT NOT NULL, effective_date TEXT NOT NULL,
 reason TEXT NOT NULL, event TEXT NOT NULL,
 changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_history_employee ON salary_history(employee_id,id DESC);
PRAGMA user_version = 1;
'''


def connect(path: str) -> sqlite3.Connection:
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute('PRAGMA foreign_keys=ON')
    connection.execute('PRAGMA busy_timeout=10000')
    return connection


def initialize(path: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with connect(path) as connection:
        connection.execute('PRAGMA journal_mode=WAL')
        connection.executescript(SCHEMA)
