FROM node:22-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV SALARY_DEMO_MODE=1 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 SALARY_DB=/data/salary.sqlite3
WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt && useradd --create-home salary && mkdir /data && chown salary:salary /data
COPY backend/ ./backend/
COPY --from=frontend /build/frontend/dist ./frontend/dist
USER salary
WORKDIR /app/backend
EXPOSE 8000
CMD ["sh", "-c", "python -m app.seed && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1"]
