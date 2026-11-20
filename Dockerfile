# syntax=docker/dockerfile:1
# ==============================================================================
# ModelOps360 Unified Full-Stack Production Dockerfile
# Multi-stage build providing React 19 Frontend + Express API + Python ML Engine
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build the React 19 Frontend via Vite
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS frontend-builder
WORKDIR /app

# Install dependencies first for maximum Docker layer caching
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy frontend source and build production bundle into /app/dist
COPY vite.config.ts tsconfig.json index.html ./
COPY src ./src
COPY server ./server
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Production Runtime (Node.js 22 + Python 3.11 Runtime)
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

LABEL maintainer="ModelOps360 Team"
LABEL description="Intelligent MLOps Platform - Full Stack Web Application & Control Plane"

# Install Python 3 runtime and curl for container health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy package descriptors and install production-only Node dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts || npm install --omit=dev
# Ensure tsx runtime is available for executing TypeScript server
RUN npm install tsx@^4.21.0

# Copy pre-built frontend from stage 1
COPY --from=frontend-builder /app/dist ./dist

# Copy application source code
COPY server ./server
COPY server.ts ./server.ts
COPY ml ./ml
COPY backend ./backend
COPY tsconfig.json ./tsconfig.json
COPY .env.example ./.env.example

# Create storage directories for persistent state & model artifacts
RUN mkdir -p /app/data /app/artifacts && \
    chmod -R 777 /app/data /app/artifacts

# Production runtime defaults
ENV NODE_ENV=production \
    APP_ENV=production \
    PORT=3000 \
    LOG_LEVEL=INFO \
    PYTHON_EXECUTABLE=/usr/bin/python3 \
    LOCAL_SQLITE_PATH=/app/data/modelops360.db \
    ARTIFACT_STORAGE_PATH=/app/artifacts \
    MLFLOW_TRACKING_URI=http://mlflow:5000

EXPOSE 3000

# Container healthcheck querying the system liveness endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/v1/health || exit 1

# Launch the unified server
CMD ["npx", "tsx", "server.ts"]
