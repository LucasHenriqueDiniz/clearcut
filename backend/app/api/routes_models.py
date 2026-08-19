from fastapi import APIRouter, HTTPException, Query

from app.schemas.models import (
    ModelBenchmarkStatus,
    ModelCatalogItem,
    ModelStatusResponse,
    ModelStorageConfig,
    RunModelBenchmarkRequest,
    UpdateModelStorageRequest,
)
from app.services.model_benchmark_service import model_benchmark_service
from app.services.model_catalog import model_catalog_service
from app.services.model_installer import model_installer_service
from app.services.model_storage_service import model_storage_service

router = APIRouter(prefix="/models", tags=["models"])


@router.get("/catalog", response_model=list[ModelCatalogItem])
def list_model_catalog(task: str | None = Query(default=None)) -> list[ModelCatalogItem]:
    return model_catalog_service.list_catalog(task=task)


@router.post("/refresh", response_model=list[ModelCatalogItem])
def refresh_model_catalog(task: str | None = Query(default=None)) -> list[ModelCatalogItem]:
    return model_catalog_service.refresh_state(task=task)


@router.get("/config", response_model=ModelStorageConfig)
def get_model_storage_config() -> ModelStorageConfig:
    return model_storage_service.get_config()


@router.patch("/config", response_model=ModelStorageConfig)
def update_model_storage_config(payload: UpdateModelStorageRequest) -> ModelStorageConfig:
    try:
        if payload.root_dir is None or not payload.root_dir.strip():
            return model_storage_service.reset_to_default(migration_mode=payload.migration_mode)
        return model_storage_service.set_root(payload.root_dir.strip(), migration_mode=payload.migration_mode)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/benchmark/status", response_model=ModelBenchmarkStatus)
def get_model_benchmark_status() -> ModelBenchmarkStatus:
    return model_benchmark_service.status()


@router.post("/benchmark/run", response_model=ModelBenchmarkStatus)
def run_model_benchmark(payload: RunModelBenchmarkRequest) -> ModelBenchmarkStatus:
    try:
        model_catalog_service.refresh_state(task=payload.task)
        return model_benchmark_service.run(payload)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{model_id}/status", response_model=ModelStatusResponse)
def get_model_status(model_id: str) -> ModelStatusResponse:
    try:
        return model_catalog_service.status_for(model_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Model not found")


@router.post("/{model_id}/install", response_model=ModelStatusResponse)
def install_model(model_id: str) -> ModelStatusResponse:
    try:
        model_installer_service.install(model_id)
        return model_catalog_service.status_for(model_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Model not found")
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{model_id}")
def delete_model(model_id: str) -> dict:
    try:
        deleted = model_installer_service.delete(model_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Model not found")
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not deleted:
        raise HTTPException(status_code=404, detail="Model not found")
    return {"deleted": True}
