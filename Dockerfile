# Build the browser bundle in a separate stage; the final image needs no Node/npm.
FROM node:22-bookworm-slim AS frontend
WORKDIR /build/frontend
# Copy manifests first so unchanged dependencies can reuse the Docker layer cache.
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
# Containers opt in to bounded synthetic-demo writes. Persist /data externally;
# restarting does not reset the dataset, and these caps are not authentication.
ENV SALARY_DEMO_MODE=1 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 SALARY_DB=/data/salary.sqlite3
WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
# Run as an unprivileged account with write access only needed for its data path.
RUN pip install --no-cache-dir -r backend/requirements.txt && useradd --create-home salary && mkdir /data && chown salary:salary /data
COPY backend/ ./backend/
COPY --from=frontend /build/frontend/dist ./frontend/dist
USER salary
WORKDIR /app/backend
EXPOSE 8000
# Idempotent seed preserves existing edits. One worker is required for the
# process-local throttle; exec forwards container termination signals to Uvicorn.
CMD ["sh", "-c", "python -m app.seed && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1"]
