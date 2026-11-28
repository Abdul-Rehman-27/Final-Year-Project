# syntax=docker/dockerfile:1
# Build context: repository root.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

COPY backend/requirements.txt /tmp/requirements-project.txt
COPY medical-assistant/backend/requirements.txt /tmp/requirements-assistant.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --default-timeout=120 --retries 10 \
    -r /tmp/requirements-project.txt -r /tmp/requirements-assistant.txt

# Layout matters: the Medical Assistant locates its settings relative to /app.
COPY backend /app/backend
COPY medical-assistant/backend /app/medical-assistant/backend
COPY docker/api/ensure_databases.py docker/api/entrypoint.sh /app/docker/
RUN chmod +x /app/docker/entrypoint.sh

EXPOSE 8000 8010
CMD ["/app/docker/entrypoint.sh"]
