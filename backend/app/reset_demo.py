"""Prepare a NEW demo baseline, never replace/delete an existing database.
Stop server, run to a fresh path, switch SALARY_DB and restart. Keep old DB as
recoverable backup. There is no HTTP reset endpoint.
"""

import argparse
from pathlib import Path

from .demo import configured_limits
from .seed import seed


def prepare_reset(destination):
    """Create and seed only a new path, returning the number of inserted employees.

    Exclusive creation refuses existing files (including symlinks) rather than
    deleting/replacing anything. If seeding fails, leave the new partial file for
    inspection and keep every old database untouched. Switching the running app
    to the new file remains a deliberate, out-of-band operator step.
    """
    if configured_limits() is None:
        raise ValueError("Reset requires SALARY_DEMO_MODE=1")
    path = Path(destination)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb"):
        pass
    return seed(str(path))


if __name__ == "__main__":
    # Both environment opt-in and an explicit synthetic-only CLI acknowledgement
    # are required. No reset capability is exposed through HTTP.
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--new-database", required=True)
    parser.add_argument("--confirm-synthetic-only", action="store_true", required=True)
    args = parser.parse_args()
    print(
        f"Prepared {prepare_reset(args.new_database):,} fictional employees at {args.new_database}."
    )
    print("Old databases untouched. Stop server, switch SALARY_DB and restart.")
