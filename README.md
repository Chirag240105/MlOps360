# ModelOps360 — Intelligent ML Model Monitoring, Drift Detection & Automated Retraining Platform

ModelOps360 is a production-oriented MLOps platform for **Retail Demand Forecasting** demonstrating the complete machine learning lifecycle: dataset ingestion and validation, time-aware feature engineering and training, MLflow experiment tracking, governed model registry, pointer-based serving, drift & performance monitoring, cooldown-guarded automated retraining, explicit rollback, and an enterprise React dashboard.

## Dual-Track Architecture

1. **Workspace Runnable Control Plane (`server.ts`, `server/`, `src/`):** Express + TypeScript API gateway + Python 3.11 ML worker + SQLite/PostgreSQL persistence + React/Tailwind/Recharts dashboard, runnable immediately on port `3000`.
2. **Production Python & Container Target (`backend/`, `airflow/`, `docker/`):** Modular FastAPI + Pydantic v2 + SQLAlchemy/Alembic + MLflow + Evidently AI + Apache Airflow codebase ready for local Docker Compose and AWS (EC2, S3, ECR, CloudWatch).

## Repository Structure (Phase 1)

```text
.
├── server.ts                  # Express + Vite runtime entrypoint (port 3000)
├── server/
│   ├── app.ts                 # Express app factory
│   ├── core/                  # Env config, structured JSON logger, domain errors
│   ├── middleware/            # X-Request-ID correlation & error boundary
│   ├── api/routes/            # REST API route handlers
│   └── tests/                 # Automated Node tests
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI entrypoint
│   │   ├── core/              # Pydantic settings, JSON logging, exceptions
│   │   └── api/routes/        # FastAPI route handlers
│   ├── tests/                 # Python unit tests
│   └── requirements.txt       # Pinned Python dependencies
├── src/                       # React + TypeScript + Tailwind frontend
├── docs/                      # Architecture, design & deep learning notes
└── .env.example               # Secret-free environment template
```

## Quick Start (Phase 1)

```bash
npm install
npm run dev       # Starts API + Frontend on http://localhost:3000
npm test          # Runs TypeScript/Express Phase 1 tests
python3 backend/tests/test_phase1_core.py
```

## Documentation Index

- [System Architecture](docs/architecture.md)
- [Engineering Learning Notes](docs/learning-notes.md)
