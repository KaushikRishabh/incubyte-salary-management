# Build the browser bundle in a separate stage; the final image needs no Node/npm.
FROM node:22.23.4-bookworm-slim AS frontend
# Patch both Node's bundled roots and Debian's CA store before npm downloads.
# Fail closed if a stale mirror cannot provide the October 2026 security update.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && dpkg --compare-versions "$(dpkg-query -W -f='${Version}' ca-certificates)" ge '20250419~deb12u2' \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build/frontend
# Copy manifests first so unchanged dependencies can reuse the Docker layer cache.
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12.15-slim-trixie
# Docker services own their trust stores; a Render platform patch is not enough.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && dpkg --compare-versions "$(dpkg-query -W -f='${Version}' ca-certificates)" ge '20250419+deb13u1' \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# Bootstrap through only the freshly patched CA bundle, not old pip's bundled
# roots. TLS verification stays enabled; this flag is scoped to this command.
RUN python -m pip install --no-cache-dir --use-deprecated=legacy-certs \
    --cert /etc/ssl/certs/ca-certificates.crt --upgrade 'pip==26.2.2'
# Containers opt in to bounded synthetic-demo writes. Persist /data externally;
# restarting does not reset the dataset, and these caps are not authentication.
ENV SALARY_DEMO_MODE=1 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 SALARY_DB=/data/salary.sqlite3
WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
# Run as an unprivileged account with write access only needed for its data path.
RUN python -m pip install --no-cache-dir -r backend/requirements.txt 'certifi==2026.10.19' \
    && python -m pip check \
    && python -c "import certifi, pip._vendor.certifi; assert certifi.__version__ == '2026.10.19'; assert pip._vendor.certifi.__version__ == '2026.10.19'" \
    && useradd --create-home salary && mkdir /data && chown salary:salary /data
COPY backend/ ./backend/
COPY --from=frontend /build/frontend/dist ./frontend/dist
USER salary
WORKDIR /app/backend
EXPOSE 8000
# Idempotent seed preserves existing edits. One worker is required for the
# process-local throttle; exec forwards container termination signals to Uvicorn.
CMD ["sh", "-c", "python -m app.seed && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1"]
