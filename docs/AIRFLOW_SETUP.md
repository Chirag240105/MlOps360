# Apache Airflow Setup & Local Deployment Guide

This guide details how to spin up and operate the ModelOps360 Apache Airflow environment.

## 1. Prerequisites

- **Docker Desktop** (Engine 24.x+, Compose v2 recommended)
- **Minimum Allocated Resources**:
  - Memory: $\ge 4.0\text{ GB}$ (6.0 GB recommended)
  - CPU: 2 Cores
  - Disk: 10 GB free space
- Python 3.11+ (for local test execution outside Docker)

## 2. Directory Structure

The Airflow deployment lives inside `orchestration/airflow/`:

```
orchestration/airflow/
├── config/
│   └── airflow.cfg               # Airflow runtime settings
├── dags/
│   ├── modelops360_health_check.py
│   ├── modelops360_ml_pipeline.py
│   ├── modelops360_scheduled_monitoring.py
│   └── modelops360_retraining_trigger.py
├── plugins/
│   └── operators/
│       └── data_validation_operator.py
├── tests/                         # Full automated test suite
├── .env.example
├── Dockerfile                     # Custom Airflow image with ML dependencies
├── docker-compose.yaml            # Multi-service stack
├── init-databases.sh              # Multi-DB PostgreSQL provisioning script
└── README.md
```

## 3. Starting the Services

### Step 1: Prepare Environment File
```bash
cd orchestration/airflow
cp .env.example .env
```

### Step 2: Initialize Database and Accounts
Run the one-time database migration and admin user creation:
```bash
docker-compose up airflow-init
```

### Step 3: Launch the Full Stack
```bash
docker-compose up -d --build
```

Verify that all containers are healthy:
```bash
docker-compose ps
```

The stack exposes:
- **Airflow Web UI**: [http://localhost:8080](http://localhost:8080) (Default user: `admin` / `admin`)
- **MLflow Tracking Server**: [http://localhost:5000](http://localhost:5000)
- **PostgreSQL Database**: Port `5432` (`airflow` and `modelops360` databases)

## 4. Triggering DAGs

### Via the Airflow Web UI:
1. Navigate to [http://localhost:8080](http://localhost:8080).
2. Unpause the `modelops360_ml_pipeline` DAG.
3. Click the **Trigger DAG** button (optionally pass configuration JSON like `{"scenario": "reference", "days": 120}`).

### Via the Command Line:
```bash
docker-compose exec airflow-webserver airflow dags trigger modelops360_ml_pipeline
```

## 5. Running Tests Locally

You can test the entire pipeline logic, operator contracts, and DAG integrity directly using pytest:
```bash
python -m pytest orchestration/airflow/tests/ -v
```
