# syntax=docker/dockerfile:1
# ==============================================================================
# ModelOps360 FastAPI Python Inference & Background Job Engine Dockerfile
# Dedicated lightweight microservice for ML serving and background scheduling
# ==============================================================================

FROM python:3.11-slim AS runtime
WORKDIR /app

LABEL maintainer="ModelOps360 Team"
LABEL description="FastAPI ML Inference, Drift Detection & Lightweight Retraining Service"

# Install curl, OpenMP, and build dependencies for C-extensions (XGBoost, Scikit-learn)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    libgomp1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install pinned Python dependencies
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r backend/requirements.txt

# Copy Python backend and ML modules
COPY backend ./backend
COPY ml ./ml
COPY .env.example ./.env.example

# Ensure storage directories exist
RUN mkdir -p /app/data /app/artifacts

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PORT=8000 \
    APP_ENV=production \
    ARTIFACT_STORAGE_PATH=/app/artifacts \
    MLFLOW_TRACKING_URI=http://mlflow:5000

EXPOSE 8000

# Container healthcheck for FastAPI
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Run FastAPI via production Uvicorn server
CMD ["python", "-m", "uvicorn", "backend.app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
