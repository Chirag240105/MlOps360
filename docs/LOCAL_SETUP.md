# ModelOps360 Local Setup & Developer Guide

## 1. Prerequisites

- **Python**: 3.11+
- **Node.js**: 20+ (Node 22 recommended)
- **Package Manager**: `npm` or `pnpm`
- **Memory**: Minimum 2 GB free RAM (zero heavy containers needed)

---

## 2. Installation Steps

### Step 1: Clone & Configure Environment
```bash
git clone https://github.com/your-username/ModelOps360.git
cd ModelOps360

# Copy local development configuration
cp .env.example .env
```

### Step 2: Install Python Dependencies
```bash
pip install -r backend/requirements.txt
```

### Step 3: Install Node / React Dashboard Dependencies
```bash
npm install
```

---

## 3. Running the Platform

ModelOps360 can be run in two modes:

### Mode A: Integrated Development Workspace (Recommended)
Spins up both the Vite frontend dashboard and the Express control plane with sub-second HMR:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Mode B: Production FastAPI Backend
Spins up the asynchronous Python inference and retraining engine:
```bash
uvicorn backend.app.main:app --port 8000 --reload
```
Open OpenAPI Swagger Documentation at [http://localhost:8000/docs](http://localhost:8000/docs).

---

## 4. Running the Automated Test Suite

Verify all ML baselines, data validation gates, drift detection, registry governance, retraining guardrails, and background jobs:

```bash
python -m pytest ml/tests/ backend/tests/ -v
```

All 28 comprehensive tests execute and pass in under 15 seconds.
