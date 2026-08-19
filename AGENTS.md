# ClearCut — agent guide

Desktop-first batch background removal and image export. Tauri (Rust shell) wraps a
React frontend (Vite) that talks HTTP to a local FastAPI backend. The backend does all
image work; the frontend never processes pixels except in the mask editor.

This file is the shared instruction set for coding agents (Claude Code, OpenCode,
Cursor, Codex, Copilot). `CLAUDE.md` just imports it — edit this file, not that one.

## Commands

Run frontend commands from `frontend/`, Python from the repo root with the backend
venv active (`backend/.venv`).

| Task | Command |
| --- | --- |
| Full desktop app (dev) | `cd frontend && npm run tauri:dev` |
| Backend alone | `python backend/run.py` |
| Frontend alone | `cd frontend && npm run dev` |
| Typecheck | `cd frontend && npm run typecheck` |
| Lint | `cd frontend && npm run lint` |
| Regenerate API types | `cd frontend && npm run gen:api` |
| Build installer | `cd frontend && npm run tauri:build` |
| Docker web stack | `make up` / `make down` |

`make help` lists the rest.

**Use npm, not pnpm.** `frontend/package-lock.json` is the tracked lockfile. A stray
`pnpm-lock.yaml` sits in the tree, now gitignored; never install from it.

Both `npm run lint` and `npm run typecheck` must be clean before you call work done;
`npm run build` runs the typecheck itself. If either tool fails to *load a module*
rather than reporting on your code, `node_modules` is stale — reinstall from scratch
instead of working around it.

Three `react-hooks` rules from the React Compiler ruleset are `warn`, not `error`:
`set-state-in-effect`, `purity` and `immutability`. They flag patterns that predate
this ESLint config and that Next's preset never checked. The warnings are real and
worth fixing; they are just not a build gate. Don't add new ones.

## Layout

```
backend/app/
  api/          FastAPI routers, one per domain (routes_jobs, routes_models, …)
  schemas/      Pydantic models — the contract the frontend types are generated from
  services/     Orchestration (job_service, watch_folder_service, model_*)
  pipelines/    engine.py = per-file pipeline; steps.py = individual image ops
  providers/    Cutout backends behind a registry (local rembg, simple CV, external API)
  storage/      SQLite stores + filesystem + provider settings
  utils/        paths.py (path guard), naming.py (output filenames)
frontend/
  index.html    Vite entry document
  src/main.tsx  React root: fonts, globals.css, providers
  src/App.tsx   The main screen. Large; prefer extracting into features/ or hooks/
  src/features/ Feature-scoped UI (jobs, settings, history, uploads, previews)
  src/hooks/    Reusable stateful logic (use-job-polling)
  src/services/api.ts  The only place that calls the backend
  src/stores/   zustand
  src/types/api.ts  GENERATED — never edit by hand
  src/types/index.ts   Public type surface; aliases src/types/api.ts
src-tauri/      Rust shell; spawns the backend as a sidecar
```

## Invariants

These exist for reasons that aren't visible from the code alone. Breaking one
reintroduces a bug that was already fixed.

**Types are generated from the backend.** After changing anything in
`backend/app/schemas/`, run `npm run gen:api`. `frontend/src/types/index.ts` aliases
generated schemas; hand-writing a backend type there defeats the whole mechanism.
Pydantic fields with a default come out optional in the OpenAPI document even though
responses always carry them — `src/types/index.ts` re-requires those three explicitly.

**Any endpoint that serves or reveals a file path must go through
`app.utils.paths.resolve_served_path`.** The backend listens on localhost with no
auth, so any local process — including a page in the user's browser — can call it. A
raw `?path=` parameter is an arbitrary file read. The guard resolves first, then
checks containment against an allowlist that grows as the app writes outputs.

**Open SQLite through `app.storage.sqlite.connect`.** `with sqlite3.connect(...)`
manages the transaction but not the connection. The helper also sets WAL and
`busy_timeout`, which is what makes concurrent job writes safe.

**Provider settings are written atomically and read through a cache.** `save()` goes
through a temp file plus `os.replace`; both sides retry on `PermissionError` because
Windows fails a rename while any handle to the target is open. Concurrent jobs persist
key bookkeeping, and a partial write would destroy the user's API keys.

**Don't reintroduce a single global rembg session.** `local_rembg._SessionPool` keeps
one session per model (LRU, 2 entries) behind a lock, with a per-model build lock so
concurrent workers don't each construct a session and throw all but one away.
Sharing one session across threads is safe — ONNX Runtime's `Run` is thread-safe.

**Jobs process files in parallel.** `job_service` runs up to `min(4, cores-1)` files
at once, capped process-wide by a semaphore because jobs themselves also run
concurrently. Anything called from `_process_file` must be thread-safe or own its own
per-file state.

**Frontend polling must be cancellable.** Use `useJobPolling`. It aborts the in-flight
request, cancels on unmount, supersedes a previous poll, and resolves only at a
terminal state. A bare recursive `setTimeout` leaks a timer chain per job.

**Only GET requests may be retried.** `src/services/api.ts` enforces this — replaying a
failed `POST /jobs` creates a duplicate job.

## Frontend build

Vite, not Next. The app has one screen and no server, so there is no router, no SSR
and no `"use client"` — if you reach for a Next API, it is gone on purpose. `@/*`
resolves to `src/*` via tsconfig, which Vite reads directly.

Fonts are bundled from the `@fontsource*` packages imported in `main.tsx`. Don't
reintroduce a font CDN: the app's whole pitch is running offline, and that has to
include building it.

Environment values come from `import.meta.env.VITE_*`, not `process.env`.

three.js is lazy-loaded in `job-queue.tsx` — it draws a decorative backdrop and is
worth about half the bundle. Keep it behind `lazy()`.

## Two runtimes

The frontend runs either inside Tauri or as a plain web page, and the difference is
load-bearing. `src/lib/platform.ts` detects the desktop shell via `__TAURI_INTERNALS__`
and is the only module allowed to reach for native APIs — file dialogs, real
filesystem paths, the backend URL from the sidecar. Anything filesystem-shaped needs
a web fallback or an explicit desktop-only gate; assuming Tauri breaks `npm run dev`,
and assuming web throws away every native affordance the app exists for.

The backend mirrors this with `RUNNING_IN_TAURI` / `RUNNING_IN_DOCKER`. Provider
settings are only encrypted (Fernet) when running under Tauri, where a machine key is
available.

## Configuration

`backend/app/core/config.py` is pydantic-settings over a root `.env` (see
`.env.example`). Every directory setting defaults to a **relative** path, so the
backend must be started with `backend/` as the working directory — `python
backend/run.py` from elsewhere scatters `data/`, `outputs/` and `uploads/` into
whatever directory you happened to be in. Stray top-level copies of those folders in
the tree are the symptom.

## Conventions

- Comments explain *why*, not *what*. Match the existing density: sparse, and only
  where the reason isn't obvious from reading the code.
- Backend code targets Windows first. Watch for `os.replace` semantics, path casing
  (`os.path.normcase`), and file handles held open.
- The UI is Tailwind + shadcn/ui primitives in `src/components/ui`. Feature UI lives in
  `src/features/<domain>/`.
- `src/services/api.ts` is the only module that talks to the backend.
- Use `logEvent` from `src/lib/dev-log.ts`, not `console.log`. It feeds the in-app dev
  console, which is the only debug channel visible in a packaged desktop build.

## Verifying changes

There is **no test suite** — neither pytest nor a frontend runner. Don't claim a
change is verified because it typechecks.

- Frontend: `npm run lint && npm run typecheck`, then exercise the path in the
  running app (`npm run tauri:dev`).
- Backend: write a throwaway script against the real modules and run it. Heavy deps
  (`rembg`, `onnxruntime`, `scipy`) must be installed for anything touching the
  pipeline to even import.
- `sample-images/` holds a handful of real JPEGs for end-to-end runs.
- If you couldn't run something, say so plainly instead of implying you did.
