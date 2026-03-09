.PHONY: help dirs build up down restart ps logs logs-backend logs-frontend backend frontend clean tauri-dev tauri-build backend-sidecar

help:
	@echo "Available targets:"
	@echo "  make dirs           Create runtime directories"
	@echo "  make build          Build backend and frontend images"
	@echo "  make up             Start the full stack with rebuild"
	@echo "  make down           Stop the stack"
	@echo "  make restart        Restart the stack"
	@echo "  make ps             Show container status"
	@echo "  make logs           Tail logs from all services"
	@echo "  make logs-backend   Tail backend logs"
	@echo "  make logs-frontend  Tail frontend logs"
	@echo "  make backend        Build only backend"
	@echo "  make frontend       Build only frontend"
	@echo "  make backend-sidecar Bundle backend for Tauri"
	@echo "  make tauri-dev      Run desktop app in Tauri dev mode"
	@echo "  make tauri-build    Build Tauri desktop app"
	@echo "  make clean          Stop stack and prune builder cache"

dirs:
	mkdir -p runtime/backend/data runtime/backend/uploads runtime/backend/outputs runtime/backend/models

build: dirs
	docker compose build

up: dirs
	docker compose up -d --build

down:
	docker compose down --remove-orphans

restart: down up

ps:
	docker compose ps

logs:
	docker compose logs -f

logs-backend:
	docker compose logs -f backend

logs-frontend:
	docker compose logs -f frontend

backend: dirs
	docker compose build backend

frontend: dirs
	docker compose build frontend

backend-sidecar:
	python3 scripts/build-backend-sidecar.py

tauri-dev:
	cd frontend && npm run tauri:dev

tauri-build:
	cd frontend && npm run tauri:build

clean: down
	docker builder prune -af
