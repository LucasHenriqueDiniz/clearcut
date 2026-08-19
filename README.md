<p align="center">
  <img src=".github/banner.png" alt="ClearCut banner" width="100%" />
</p>

<h1 align="center">ClearCut</h1>

<p align="center">
  Desktop-first background removal and image export tool built for fast production workflows.
</p>

<p align="center">
  Maintained by <a href="https://www.lucashdo.com/">Lucas Henrique Diniz</a> ·
  <a href="mailto:lucashdo@protonmail.com">lucashdo@protonmail.com</a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/LucasHenriqueDiniz/clearcut?display_name=release&style=for-the-badge&logo=github" alt="Latest release" />
  <img src="https://img.shields.io/badge/Tauri-2.x-24C8D8?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/Next.js-15-111111?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/FastAPI-Python-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI Python" />
</p>

<p align="center">
  <a href="https://github.com/LucasHenriqueDiniz/clearcut/releases/latest">
    <img src="https://img.shields.io/badge/Download-Latest%20Release-6366F1?style=for-the-badge&logo=github&logoColor=white" alt="Download latest release" />
  </a>
</p>

<p align="center">
  <img src=".github/workflows/assets/idle.png" alt="ClearCut app screenshot" width="100%" />
</p>

## What it does

ClearCut is designed for high-volume image workflows on desktop.

Main use cases:

- remove background in batches
- convert formats
- trim transparent bounds
- apply background color
- refine masks manually
- export with naming rules
- save everything to a folder or ZIP

## Highlights

- Native desktop import:
  - file picker
  - folder picker
  - drag and drop
  - clipboard paste
- Batch queue with per-file states, processed in parallel
- Local background removal with installable model selection
- Optional provider fallback
- Persistent backend presets
- Desktop watch folders for automated ingest
- Manual mask editor
- Output controls:
  - PNG / WebP / JPEG / AVIF
  - quality
  - keep size or custom size
  - aspect ratio
  - transparent or solid background
- Naming controls:
  - keep original
  - custom pattern
  - OCR text naming with Tesseract
- Save all outputs
- Save as ZIP
- History and provider settings
- Settings sub-pages for models and watch folders

## Stack

- Frontend:
  - Next.js 15
  - React 19
  - TypeScript
  - Tailwind CSS
  - Zustand
  - Framer Motion
- Backend:
  - FastAPI
  - Pillow
  - rembg on ONNX Runtime
  - NumPy / SciPy
  - pytesseract
  - SQLite
- Desktop shell:
  - Tauri 2
  - Rust bootstrap

## Architecture

ClearCut is desktop-first.

The flow is:

1. Files are selected natively
2. The frontend keeps UI state and previews
3. The backend processes images from disk
4. Outputs are written locally
5. The app exposes native actions like:
   - open output folder
   - reveal file
   - save all
   - save as ZIP

## Project structure

```text
backend/
  app/
  data/
  outputs/
  uploads/

frontend/
  app/
  components/
  features/
  hooks/
  lib/
  services/
  stores/
  types/

src-tauri/
  capabilities/
  resources/
  src/
```

## Run locally

### Prerequisites

- Node.js 20+
- Rust toolchain
- Python 3.12 or 3.13

### Backend

Windows:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Linux / macOS / WSL:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Frontend

```bash
cd frontend
npm install
```

### Start desktop app

```bash
cd frontend
npm run tauri:dev
```

Or:

```bash
make tauri-dev
```

## Build

Build backend sidecar:

```bash
python scripts/build-backend-sidecar.py
```

Build installer:

```bash
cd frontend
npm run tauri:build
```

## Development

The frontend types in `frontend/types/api.ts` are generated from the backend's
OpenAPI document, so they cannot drift from the Pydantic schemas. After changing
anything under `backend/app/schemas/`, regenerate them:

```bash
cd frontend && npm run gen:api
```

Typecheck before opening a PR:

```bash
cd frontend && npx tsc --noEmit
```

`AGENTS.md` documents the architecture invariants and is read by coding agents
(Claude Code, OpenCode, Cursor, Copilot). Worth a read before contributing.

## Docker

If you want the web stack in containers:

```bash
docker compose up -d --build
```

Frontend:

```text
http://localhost:3000
```

Backend docs:

```text
http://localhost:8000/docs
```
