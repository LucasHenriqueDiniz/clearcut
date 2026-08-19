from fastapi import APIRouter, HTTPException

from app.schemas.presets import CreatePresetRequest, PresetItem, UpdatePresetRequest
from app.storage.preset_store import preset_store

router = APIRouter(prefix="/presets", tags=["presets"])


@router.get("", response_model=list[PresetItem])
def list_presets() -> list[PresetItem]:
    return preset_store.list()


@router.post("", response_model=PresetItem)
def create_preset(payload: CreatePresetRequest) -> PresetItem:
    return preset_store.create(payload)


@router.patch("/{preset_id}", response_model=PresetItem)
def update_preset(preset_id: str, payload: UpdatePresetRequest) -> PresetItem:
    try:
        return preset_store.update(preset_id, payload)
    except KeyError:
        raise HTTPException(status_code=404, detail="Preset not found")
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))


@router.delete("/{preset_id}")
def delete_preset(preset_id: str) -> dict:
    try:
        deleted = preset_store.delete(preset_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    if not deleted:
        raise HTTPException(status_code=404, detail="Preset not found")
    return {"deleted": True}
