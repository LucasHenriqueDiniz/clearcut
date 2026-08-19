"""Dump the FastAPI OpenAPI document so the frontend can generate types from it.

Run from the repo root (or anywhere) with the backend venv active:

    python backend/scripts/export_openapi.py

The frontend's `pnpm gen:api` calls this and then feeds the result to
openapi-typescript, so `frontend/types/api.ts` always matches the Pydantic
schemas instead of being hand-maintained alongside them.
"""

import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

DEFAULT_OUTPUT = BACKEND_ROOT / "openapi.json"


def main() -> int:
    from app.main import app

    target = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_OUTPUT
    target.parent.mkdir(parents=True, exist_ok=True)
    document = app.openapi()
    # Sorted keys and a trailing newline keep the diff readable when the schema
    # changes, so a regenerated file shows only what actually moved.
    target.write_text(
        json.dumps(document, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(
        f"Wrote {target} "
        f"({len(document.get('paths', {}))} paths, "
        f"{len(document.get('components', {}).get('schemas', {}))} schemas)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
