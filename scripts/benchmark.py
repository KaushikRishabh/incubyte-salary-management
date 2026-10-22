"""Reproducible local API measurement; not a production load-test claim."""
import json
import statistics
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / 'backend'))
from fastapi.testclient import TestClient
from app.main import create_app
from app.seed import seed

with tempfile.TemporaryDirectory() as directory:
    path = str(Path(directory) / 'benchmark.sqlite3')
    start = time.perf_counter()
    seed(path)
    seed_seconds = time.perf_counter() - start
    results = {'employees': 10000, 'seed_seconds': round(seed_seconds, 3), 'measurements': []}
    with TestClient(create_app(path)) as client:
        for route in ['/api/employees?page_size=25', '/api/employees?q=000&country=India', '/api/analytics?group_by=department']:
            durations = []
            for _ in range(50):
                start = time.perf_counter()
                response = client.get(route)
                response.raise_for_status()
                durations.append((time.perf_counter() - start) * 1000)
            results['measurements'].append({'route':route,'requests':50,'median_ms':round(statistics.median(durations),2),'p95_ms':round(sorted(durations)[47],2)})
    print(json.dumps(results,indent=2))
