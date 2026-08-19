from fastapi import APIRouter, HTTPException

from app.schemas.watch_folders import WatchFolderCreateRequest, WatchFolderItem, WatchFolderUpdateRequest
from app.services.watch_folder_service import watch_folder_service

router = APIRouter(prefix="/watch-folders", tags=["watch-folders"])


@router.get("", response_model=list[WatchFolderItem])
def list_watch_folders() -> list[WatchFolderItem]:
    return watch_folder_service.list_watch_folders()


@router.post("", response_model=WatchFolderItem)
def create_watch_folder(payload: WatchFolderCreateRequest) -> WatchFolderItem:
    try:
        return watch_folder_service.create_watch_folder(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.patch("/{watch_folder_id}", response_model=WatchFolderItem)
def update_watch_folder(watch_folder_id: str, payload: WatchFolderUpdateRequest) -> WatchFolderItem:
    try:
        return watch_folder_service.update_watch_folder(watch_folder_id, payload)
    except KeyError:
        raise HTTPException(status_code=404, detail="Watch folder not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{watch_folder_id}")
def delete_watch_folder(watch_folder_id: str) -> dict:
    if not watch_folder_service.delete_watch_folder(watch_folder_id):
        raise HTTPException(status_code=404, detail="Watch folder not found")
    return {"deleted": True}


@router.post("/{watch_folder_id}/enable", response_model=WatchFolderItem)
def enable_watch_folder(watch_folder_id: str) -> WatchFolderItem:
    try:
        return watch_folder_service.set_enabled(watch_folder_id, True)
    except KeyError:
        raise HTTPException(status_code=404, detail="Watch folder not found")


@router.post("/{watch_folder_id}/disable", response_model=WatchFolderItem)
def disable_watch_folder(watch_folder_id: str) -> WatchFolderItem:
    try:
        return watch_folder_service.set_enabled(watch_folder_id, False)
    except KeyError:
        raise HTTPException(status_code=404, detail="Watch folder not found")


@router.get("/{watch_folder_id}/status", response_model=WatchFolderItem)
def watch_folder_status(watch_folder_id: str) -> WatchFolderItem:
    item = watch_folder_service.get_watch_folder(watch_folder_id)
    if not item:
        raise HTTPException(status_code=404, detail="Watch folder not found")
    return item
