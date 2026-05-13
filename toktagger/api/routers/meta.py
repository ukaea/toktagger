from fastapi import APIRouter, Request
from toktagger.api.core.data_loaders import LoaderRegistry
from toktagger.api.models.base import ModelRegistry
from toktagger.api.schemas.models import LoadTypes
import typing
import os

router = APIRouter(prefix="/meta", tags=["Metadata"])


@router.get("/dataloader")
async def get_dataloaders(request: Request) -> list[str]:
    """Get list of available dataloaders."""
    return LoaderRegistry.names()


@router.get("/models")
async def get_model_types(task: str) -> list[str]:
    """Get list of available models for a given task."""
    return ModelRegistry.names(task)


@router.get("/models/load")
async def get_model_load_methods() -> list[str]:
    """Get list of enabled ways to load pretrained weights into the server."""
    return [LoadTypes.LOCAL] if not os.environ.get("DISABLE_LOCAL_MODEL_LOAD") else []


@router.get("/dataloader/{loader}")
async def get_data_schema(loader: str) -> dict[str, typing.Any]:
    """Get schema which is required for getting data with this dataloader"""
    return LoaderRegistry.get_data_schema(loader)


@router.get("/models/{model}/train")
async def get_model_training_schema(model: str) -> dict[str, typing.Any] | None:
    """Get params required for training this model."""
    return ModelRegistry.get_params_schema(
        model, schema_type="training", return_draft_07=True
    )


@router.get("/models/{model}/predict")
async def get_model_prediction_schema(model: str) -> dict[str, typing.Any] | None:
    """Get params required for predicting with this model."""
    return ModelRegistry.get_params_schema(
        model, schema_type="prediction", return_draft_07=True
    )
