from datetime import datetime
from fastapi import APIRouter, HTTPException
from app.schemas.jobs import HistoryItem
from app.storage.history import history_store

router = APIRouter(prefix="/history", tags=["history"])


@router.get("", response_model=list[HistoryItem])
def list_history(limit: int = 200) -> list[HistoryItem]:
    rows = history_store.list(limit=limit)
    out: list[HistoryItem] = []
    for row in rows:
        out.append(
            HistoryItem(
                id=row["id"],
                original_filename=row["original_filename"],
                output_filename=row["output_filename"],
                engine_used=row["engine_used"],
                provider_used=row["provider_used"],
                processing_options=row["processing_options"],
                created_at=datetime.fromisoformat(row["created_at"]),
                success=bool(row["success"]),
                error_message=row["error_message"],
                input_path=row["input_path"],
                output_path=row["output_path"],
            )
        )
    return out


@router.delete("/{item_id}")
def delete_history(item_id: int) -> dict:
    ok = history_store.delete(item_id)
    if not ok:
        raise HTTPException(status_code=404, detail="History item not found")
    return {"deleted": True}
