# ClearCut (Local-First MVP + Tauri Shell)

Functional prototype focused on fast image production workflows on desktop: batch background removal, format conversion, trim/crop, presets, provider fallback, history, and organized outputs.

## Stack
- Frontend: Next.js 15 (App Router), TypeScript, Tailwind, Zustand, Framer Motion, Lucide
- Backend: FastAPI (Python), Pillow, rembg
- Desktop shell: Tauri 2 + Rust bootstrap + Python sidecar

## What is implemented
- Drag and drop multi-file upload
- File picker + folder picker + clipboard paste
- Input validation + corrupted image detection
- Batch queue with states: `queued`, `processing`, `done`, `failed`, `canceled`
- Real local background removal (`rembg`) with local model selection
- External provider adapter implemented: `remove.bg` (optional API fallback)
- Provider registry with:
  - common interface
  - priority ordering
  - multiple keys per provider
  - key rotation
  - cooldown on failures/rate limits
  - provider status and connection test endpoint
- Modular processing pipeline steps:
  - read image
  - normalize EXIF orientation
  - remove background
  - trim transparent bounds
  - optional padding
  - optional resize
  - optional solid background replacement
  - export with quality settings
  - optional alpha mask output
- Presets:
  - Quick cutout
  - Product image
  - Portrait
  - Anime/art
  - Convert only
  - Remove bg + trim + webp
- Organized output structure in `backend/outputs`:
  - `png/`, `webp/`, `jpg/`, `masks/`, `tmp/`, `zips/`, `logs/`
- Download by file and ZIP by job
- History persisted in local SQLite (`backend/data/history.db`)
- Settings page for providers and API keys (no hardcoded keys)
- "Reveal in folder" and "Open output folder" actions
- Tauri 2 shell with:
  - backend bootstrap on a dynamic localhost port
  - desktop runtime directories under app data
  - native file picker and folder picker
  - native `Save all` copy-to-folder flow
  - native `Open output folder` and `Reveal file`
  - packaged backend sidecar build script

## Project structure

```text
backend/
  app/
    api/
    core/
    schemas/
    services/
    providers/
    pipelines/
    storage/
    workers/
    utils/
  data/
  uploads/
  outputs/
frontend/
  app/
  components/
  features/
    uploads/
    jobs/
    previews/
    settings/
    history/
  stores/
  lib/
  hooks/
  types/
  services/
src-tauri/
  src/
  capabilities/
  resources/
scripts/
```

## Setup Modes

### 1) Desktop app with Tauri (recommended for real daily use)

This is now the primary desktop path. The Tauri shell starts the FastAPI backend automatically and keeps runtime data outside the repo.

Desktop runtime directories:
- Windows: `%APPDATA%\\com.local.clearcut\\`
- Tauri runtime subfolders:
  - `data`
  - `uploads`
  - `outputs`
  - `models`
  - `logs`

### Tauri prerequisites
- Node.js 20+
- Rust toolchain
- Python 3.12 or 3.13
- Backend dependencies installed in `backend/.venv`

Windows setup:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

cd ..\frontend
npm install
```

WSL / Linux / macOS setup:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cd ../frontend
npm install
```

Run desktop app in development:

```bash
cd frontend
npm run tauri:dev
```

or from repo root:

```bash
make tauri-dev
```

Windows helpers:
- `scripts\\tauri-dev.bat`
- `scripts\\build-backend-sidecar.bat`
- `scripts\\tauri-build.bat`

WSL/Linux/macOS helpers:
- `./scripts/tauri-dev.sh`
- `./scripts/build-backend-sidecar.sh`
- `./scripts/tauri-build.sh`

Build packaged backend sidecar:

```bash
python scripts/build-backend-sidecar.py
```

Build Windows installer:

```bash
cd frontend
npm run tauri:build
```

or:

```bash
make backend-sidecar
make tauri-build
```

Notes:
- `tauri dev` uses `backend/.venv` if available.
- Packaged builds expect the PyInstaller sidecar in `src-tauri/resources/backend/`.
- The frontend is exported statically for the Tauri bundle.

### 2) Docker (isolated web stack)

### 0) Prerequisites
- Docker Desktop installed
- WSL2 backend enabled in Docker Desktop (recommended on Windows)

### 1) Run with Docker (isolated app runtime)

All app runtime files are isolated under:
- `runtime/backend/data`
- `runtime/backend/uploads`
- `runtime/backend/outputs`
- `runtime/backend/models`

Start:

```bash
docker compose up -d --build
```

or:

```bash
make up
```

or:
- Windows: `scripts\\docker-up.bat`
- Linux/macOS/WSL: `./scripts/docker-up.sh`

Stop:

```bash
docker compose down
```

or:

```bash
make down
```

or:
- Windows: `scripts\\docker-down.bat`
- Linux/macOS/WSL: `./scripts/docker-down.sh`

URLs:
- Frontend: `http://localhost:3000`
- Backend docs: `http://localhost:8000/docs`

Useful `make` commands:
- `make help`
- `make up`
- `make down`
- `make restart`
- `make ps`
- `make logs`
- `make logs-backend`
- `make logs-frontend`
- `make clean`

### 3) Plain web mode without Docker

### 1) Environment files
Copy `.env.example` values into:
- `backend/.env`
- `frontend/.env.local`

Also available as templates:
- `backend/.env.example`
- `frontend/.env.example`

### 2) Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

For local Python install, use Python `3.12` or `3.13` to avoid package compatibility issues.

Backend docs: `http://127.0.0.1:8000/docs`

### 3) Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: `http://127.0.0.1:3000`

### 4) One-command scripts
- Linux/macOS: `./scripts/dev.sh`
- Windows: `scripts\dev.bat`

## Provider configuration
Use UI: `Settings` tab.

- Add API keys by provider (e.g., `remove_bg_api`)
- Set key labels and priority
- Enable/disable providers and keys
- Toggle `use only local processing`
- Click `Test connection`

Web mode stores provider settings in `backend/data/providers.json`.

Desktop mode stores provider settings under the Tauri `data` directory and encrypts them into `providers.secure.json` by default. This is a controlled encrypted-file fallback. If you want to supply your own key, set `PROVIDER_SETTINGS_KEY`.

## API endpoints (real)
- `POST /jobs/upload`
- `POST /jobs`
- `POST /jobs/batch`
- `POST /jobs/single`
- `GET /jobs/{job_id}`
- `POST /jobs/{job_id}/cancel`
- `GET /jobs/{job_id}/zip`
- `GET /jobs/download?path=...`
- `GET /providers/status`
- `GET /providers/settings`
- `POST /providers/settings`
- `POST /providers/test/{provider_name}`
- `GET /history`
- `DELETE /history/{item_id}`
- `POST /fs/reveal?path=...`
- `POST /fs/open-output`

## How to add new providers
1. Create provider adapter in `backend/app/providers/<name>.py` implementing `BackgroundRemovalProvider`.
2. Implement:
   - `health()`
   - `remove_background(image_bytes, model, api_key)`
3. Register provider in `ProviderRegistry` (`backend/app/providers/registry.py`).
4. Add default settings (priority/enabled) in `_ensure_defaults()`.
5. Provider automatically appears in Settings UI and can receive multiple keys.

## Tauri runtime details
- The frontend calls a platform adapter in `frontend/lib/platform.ts`.
- In Tauri mode it asks Rust to:
  - bootstrap the backend
  - list image files in a selected folder
  - copy exported files to a selected folder
  - open or reveal files in the OS
- The Rust shell starts the Python backend with:
  - `BACKEND_HOST`
  - `BACKEND_PORT`
  - `DATA_DIR`
  - `UPLOAD_DIR`
  - `OUTPUT_DIR`
  - `MODELS_DIR`
  - `LOGS_DIR`
  - `RUNNING_IN_TAURI=true`

## Release flow
1. Install backend dependencies in `backend/.venv`.
2. Install frontend dependencies in `frontend/node_modules`.
3. Bundle the backend sidecar with PyInstaller.
4. Build the Tauri app.
5. Distribute the generated NSIS installer.

Typical commands:

```bash
python scripts/build-backend-sidecar.py
cd frontend
npm run tauri:build
```

## Notes / known limitations in this MVP
- AVIF/HEIC support depends on local Pillow/build codecs on your machine.
- remove.bg key test is configuration-level and health-level; deep quota/account checks can be added with provider-specific endpoint calls.
- The current desktop security model uses an encrypted local file for provider settings, not OS credential vault integration yet.
- Watch-folder service is scaffolded (`backend/app/workers/watch_folder.py`) for future implementation.
