# syntax=docker/dockerfile:1.7

# ---------- Stage 1: build the SPA ----------
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci || npm install
COPY frontend/ ./
RUN npm run build

# ---------- Stage 2: download ONNX models ----------
FROM python:3.12-slim AS models
WORKDIR /tmp
ENV U2NET_HOME=/models
RUN mkdir -p /models && pip install --no-cache-dir "rembg[cpu]==2.0.59"
COPY docker/download-models.py /tmp/download-models.py
RUN python /tmp/download-models.py

# ---------- Stage 3: runtime ----------
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    U2NET_HOME=/root/.u2net \
    STICKUT_CACHE_DIR=/app/cache \
    STICKUT_TEMPLATES_DIR=/app/templates \
    STICKUT_TMP_DIR=/app/tmp \
    STICKUT_PORT=8000

# System deps for Pillow (HEIC/AVIF decoders, libxml2 for lxml).
RUN apt-get update && apt-get install -y --no-install-recommends \
        libheif1 libde265-0 libavif15 libxml2 libxslt1.1 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps first for layer caching.
COPY backend/pyproject.toml /app/backend/pyproject.toml
RUN cd /app/backend && pip install --upgrade pip && pip install -e .

# Backend code.
COPY backend/ /app/backend/

# Pre-built SPA into FastAPI's static dir.
COPY --from=frontend-build /app/frontend/dist/ /app/backend/static/

# Pre-downloaded ONNX models.
COPY --from=models /models/ /root/.u2net/

# Default templates shipped in the image (admins still mount over via volume).
COPY templates/ /app/templates/

# Runtime dirs (cache + tmp are usually mounted as volumes).
RUN mkdir -p /app/cache/cutouts /app/tmp

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fs http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--app-dir", "/app/backend", "--host", "0.0.0.0", "--port", "8000"]
