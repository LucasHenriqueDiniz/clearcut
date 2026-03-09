#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
mkdir -p runtime/backend/data runtime/backend/uploads runtime/backend/outputs runtime/backend/models

docker compose up -d --build

echo "Frontend: http://localhost:3000"
echo "Backend : http://localhost:8000/docs"
