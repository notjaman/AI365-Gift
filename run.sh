#!/usr/bin/env bash
# One-command launch: build the Vue frontend, prep the Python backend, serve both on :8000.
set -euo pipefail
cd "$(dirname "$0")"

# 1. Frontend: install deps once, then build -> frontend/dist
if [ ! -d frontend/node_modules ]; then
  echo "[run] installing frontend deps..."
  (cd frontend && npm install)
fi
echo "[run] building frontend..."
(cd frontend && npm run build)

# 2. Backend: create venv once, install deps
if [ ! -d backend/.venv ]; then
  echo "[run] creating backend venv..."
  python3 -m venv backend/.venv
fi
echo "[run] installing backend deps..."
backend/.venv/bin/pip install -q -r backend/requirements.txt

# 3. Ensure .env exists (blank = MOCK mode)
[ -f .env ] || cp .env.example .env

# 4. Run (serves SPA + API)
echo "[run] starting server on http://localhost:8000"
cd backend
exec .venv/bin/uvicorn app:app --host 0.0.0.0 --port 8000
