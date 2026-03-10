<p align="center">
  <img src=".github/workflows/assets/banner.png" alt="ClearCut banner" width="100%" />
</p>

<h1 align="center">ClearCut</h1>

<p align="center">
  Local-first desktop app for background removal, batch export, format conversion, masking, naming rules, and fast image workflows.
</p>

<p align="center">
  <a href="https://github.com/LucasHenriqueDiniz/clearcut/releases/latest">
    <img src="https://img.shields.io/github/v/release/LucasHenriqueDiniz/clearcut?display_name=release&style=for-the-badge&logo=github" alt="Latest release" />
  </a>
  <img src="https://img.shields.io/badge/Tauri-2.x-24C8D8?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/Next.js-15-111111?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/FastAPI-Python-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI Python" />
  <img src="https://img.shields.io/badge/Desktop-Windows%20first-2d2d38?style=for-the-badge" alt="Desktop first" />
</p>

<p align="center">
  <a href="https://github.com/LucasHenriqueDiniz/clearcut/releases/latest">
    <img src="https://img.shields.io/badge/Download-Latest%20Release-6366F1?style=for-the-badge&logo=github&logoColor=white" alt="Download latest release" />
  </a>
  <a href="https://github.com/LucasHenriqueDiniz/clearcut/releases">
    <img src="https://img.shields.io/badge/View-All%20Releases-16161A?style=for-the-badge&logo=github&logoColor=white" alt="View all releases" />
  </a>
</p>

<p align="center">
  <img src=".github/workflows/assets/idle.png" alt="ClearCut app preview" width="100%" />
</p>

## Overview

ClearCut is a desktop-first image production tool built for high-volume workflows.

It focuses on:

- background removal
- local-first processing
- batch queues
- mask refinement
- image conversion
- export presets
- naming automation
- provider fallback

The app runs inside a Tauri shell, uses a Next.js frontend, and starts a FastAPI backend sidecar automatically.

## Highlights

- Native desktop file import:
  - file picker
  - folder picker
  - drag and drop
  - clipboard paste
- Batch queue with per-file states:
  - `queued`
  - `processing`
  - `done`
  - `failed`
  - `canceled`
- Local background removal with model selection
- Optional external provider fallback
- Mask refinement editor
- Output controls:
  - PNG / WebP / JPEG / AVIF
  - quality
  - keep size or custom size
  - aspect ratio expansion
  - background replacement
- Naming controls:
  - keep original
  - pattern-based naming
  - OCR text naming with Tesseract
- Save all outputs to a chosen folder
- Save job result as ZIP
- History tracking
- Provider settings and API key management

## Download

For normal users, the safest permanent button is:

```text
https://github.com/LucasHenriqueDiniz/clearcut/releases/latest
```

That always resolves to the latest release page.

### Direct latest installer URL

If you want a direct `latest` download link, the asset name must stay stable across releases.

Good:

```text
https://github.com/LucasHenriqueDiniz/clearcut/releases/latest/download/ClearCut_x64-setup.exe
```

Risky:

```text
https://github.com/LucasHenriqueDiniz/clearcut/releases/latest/download/ClearCut_0.1.0_x64-setup.exe
```

The second form breaks as soon as the version changes in the filename.

### About SHA-256

Use the SHA-256 value for integrity verification, not as the download target.

Example:

```text
sha256:54d3f83fd156ff5b3352621194449b6b9b2898c7cad15d81bcb9d1183752b8f9
```

That is useful for:

- release notes
- installer verification
- CI artifacts

It is not a replacement for the actual download URL.

## Tech Stack

- Frontend:
  - Next.js 15
  - React 19
  - TypeScript
  - Tailwind CSS
  - Zustand
  - Framer Motion
- Desktop shell:
  - Tauri 2
  - Rust bootstrap
- Backend:
  - FastAPI
  - Pillow
  - rembg
  - pytesseract

## Runtime Architecture

ClearCut is not a pure web app wrapped in desktop chrome.

The intended flow is:

1. Desktop file paths are selected natively
2. The frontend keeps UI state and previews
3. The backend processes images from disk
4. Outputs are written to structured runtime folders
5. The app exposes native actions like:
   - open output folder
   - reveal file
   - save all
   - save as ZIP

## Project Structure

```text
backend/
  app/
    api/
    core/
    pipelines/
    providers/
    schemas/
    services/
    storage/
    utils/
    workers/
  data/
  outputs/
  uploads/

frontend/
  app/
  components/
  features/
    history/
    jobs/
    previews/
    settings/
    uploads/
  lib/
  services/
  stores/
  types/

src-tauri/
  capabilities/
  resources/
  src/

scripts/
```

## Development

### Prerequisites

- Node.js 20+
- Rust toolchain
- Python 3.12 or 3.13

### Backend setup

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

### Frontend setup

```bash
cd frontend
npm install
```

### Run the desktop app

```bash
cd frontend
npm run tauri:dev
```

Or from repo root:

```bash
make tauri-dev
```

## Build

### Build backend sidecar

```bash
python scripts/build-backend-sidecar.py
```

### Build desktop installer

```bash
cd frontend
npm run tauri:build
```

Or:

```bash
make backend-sidecar
make tauri-build
```

## Docker

If you want the web stack isolated in containers:

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

## Release Notes Tip

For GitHub Releases, the cleanest setup is:

- keep a stable installer filename for the latest direct-download button
- publish the exact versioned asset too
- include SHA-256 in release notes

Recommended pair:

```text
ClearCut_x64-setup.exe
ClearCut_0.1.0_x64-setup.exe
```

Then your README button can always use:

```text
https://github.com/LucasHenriqueDiniz/clearcut/releases/latest/download/ClearCut_x64-setup.exe
```

## Status

ClearCut is already usable as a real desktop workflow tool and is now focused on refinement, export ergonomics, provider polish, and packaging quality.
