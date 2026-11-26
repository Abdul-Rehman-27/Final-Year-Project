# syntax=docker/dockerfile:1
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --default-timeout=120 --retries 10 -r requirements.txt

COPY . /app/medical-assistant/backend

WORKDIR /app/medical-assistant/backend
EXPOSE 8010
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010"]