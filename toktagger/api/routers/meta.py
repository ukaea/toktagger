from fastapi import APIRouter, Request
from toktagger.api.core.data_loaders import LoaderRegistry
from toktagger.api.models.base import ModelRegistry

router = APIRouter(prefix="/meta", tags=["Metadata"])


@router.get("/dataloader")
async def get_dataloaders(request: Request) -> list[str]:
    """Get list of available dataloaders."""
    return LoaderRegistry.names()


@router.get("/dataloader/{loader}")
async def get_data_schema(loader: str) -> dict:
    """Get schema which is required for getting data with this dataloader"""
    return LoaderRegistry.get_data_schema(loader)


@router.get("/models/{model}")
async def get_model_schema(model: str) -> dict | None:
    """Get params required for training this model."""
    return ModelRegistry.get_params_schema(model)
