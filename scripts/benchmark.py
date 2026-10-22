"""Reproducible in-process API measurements, not a production load-test claim.

All benchmark seeding and samples use a disposable 10,000-row database, not local
employee records. Importing app.main still initializes its configured schema.
Samples include TestClient/ASGI overhead but exclude network latency, browser
rendering, TLS, multiple processes and sustained concurrent load.
"""

import json
import statistics
import sys
import tempfile
import time
from pathlib import Path

from fastapi.testclient import TestClient

# This standalone utility is run from the repo root, not an installed package.
sys.path.insert(0, str(Path(__file__).parents[1] / "backend"))
from app.main import create_app  # noqa: E402
from app.seed import seed  # noqa: E402


def benchmark():
    """Return seed timing plus 50 sequential latency samples per representative route."""
    with tempfile.TemporaryDirectory() as directory:
        path = str(Path(directory) / "benchmark.sqlite3")
        start = time.perf_counter()
        seed(path)
        seed_seconds = time.perf_counter() - start
        results = {"employees": 10000, "seed_seconds": round(seed_seconds, 3), "measurements": []}
        with TestClient(create_app(path)) as client:
            for route in [
                "/api/employees?page_size=25",
                "/api/employees?q=000&country=India",
                "/api/analytics?group_by=department",
            ]:
                durations = []
                for _ in range(50):
                    start = time.perf_counter()
                    response = client.get(route)
                    response.raise_for_status()
                    durations.append((time.perf_counter() - start) * 1000)
                results["measurements"].append(
                    {
                        "route": route,
                        "requests": 50,
                        "median_ms": round(statistics.median(durations), 2),
                        # Nearest-rank p95: ceil(0.95 * 50) = sample 48 (index 47).
                        "p95_ms": round(sorted(durations)[47], 2),
                    }
                )
        return results


if __name__ == "__main__":
    print(json.dumps(benchmark(), indent=2))
