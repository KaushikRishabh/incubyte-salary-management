"""Prepare a NEW demo baseline, never replace/delete an existing database.
Stop server, run to a fresh path, switch SALARY_DB and restart. Keep old DB as
recoverable backup. There is no HTTP reset endpoint.
"""

import argparse
from pathlib import Path

from .demo import configured_limits
from .seed import seed


def prepare_reset(destination):
    if configured_limits() is None:
        raise ValueError("Reset requires SALARY_DEMO_MODE=1")
    path = Path(destination)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb"):
        pass
    return seed(str(path))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--new-database", required=True)
    parser.add_argument("--confirm-synthetic-only", action="store_true", required=True)
    args = parser.parse_args()
    print(
        f"Prepared {prepare_reset(args.new_database):,} fictional employees at {args.new_database}."
    )
    print("Old databases untouched. Stop server, switch SALARY_DB and restart.")
