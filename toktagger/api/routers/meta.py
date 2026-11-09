import typing

from fastapi import APIRouter, Depends, Request

from toktagger.api import config
from toktagger.api.auth.dependencies import get_current_user
from toktagger.api.core.data_loaders import LoaderRegistry
from toktagger.api.models import check_models_enabled, models_dependencies_installed
from toktagger.api.schemas.models import LoadMethods

if models_dependencies_installed():
    from toktagger.api.models.base import ModelRegistry
else:
    ModelRegistry = None

router = APIRouter(
    prefix="/meta",
    tags=["Metadata"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/dataloader", operation_id="get_dataloaders", tags=["MCP"])
async def get_dataloaders(request: Request) -> list[str]:
    """
    Get a list of all registered data loader names
    (e.g. "uda", "tabular", "image", "uda_camera", "fair_mast", "sal").

    Returns
    -------
    list[str]
        A list of string data loader names.

    Notes
    -----
    Requires an active authenticated user (browser session or bearer token).

    Use When:
        - Creating a new project and need to choose a valid data loader
        - Discovering which data sources are available
        - Validating a data_loader name before creating samples
    Do Not Use When:
        - You already know the data loader and need its schema - use get_data_schema instead
        - You need to know which dataloader a specific project uses - use get_projects instead
        - You need information about diagnostic data for a sample - retrieve raw data with the Python client instead
    Example User Requests:
        - "What data loaders are available?"
        - "Can I load data from UDA?"
    """
    return LoaderRegistry.names()


@router.get("/dataloader/{loader}", operation_id="get_data_schema", tags=["MCP"])
async def get_data_schema(loader: str) -> dict[str, typing.Any]:
    """
    Get the data parameter schema required for getting data with this data
    loader, describing the parameters needed to fetch sample data.

    Parameters
    ----------
    loader : str
        The name of the data loader to get the schema for.

    Returns
    -------
    dict[str, typing.Any]
        A dict describing the data schema (parameter names, types, defaults).

    Notes
    -----
    Requires an active authenticated user (browser session or bearer token).

    Use When:
        - You need to know what parameters to pass to the data endpoint
        - You need to know which parameters to prompt the user for when getting data for a sample
    Do Not Use When:
        - You need to know which dataloader a specific project uses - use get_projects instead
        - You need information about diagnostic data for a sample - retrieve raw data with the Python client instead
    Example User Requests:
        - "What parameters does the UDA loader need?"
        - "Show me the schema for the tabular data loader"
    """
    return LoaderRegistry.get_data_schema(loader)


@router.get("/dataloader/{loader}/help")
async def get_signal_name_help(loader: str) -> str | None:
    """Get help text which describes the signal names this dataloader expects."""
    return LoaderRegistry.get_signal_name_help(loader)


@router.get(
    "/models",
    operation_id="get_model_types",
    tags=["MCP"],
    dependencies=[Depends(check_models_enabled)],
)
async def get_model_types(task: str) -> list[str]:
    """
    Get a list of available ML model types for a specified task
    ("time-series", "video", "profile-2d").

    Parameters
    ----------
    task : Task
        The task type to get model types for.

    Returns
    -------
    list[str]
        A list of model type strings (e.g. ["disruption_cnn"]).

    Notes
    -----
    Requires an active authenticated user (browser session or bearer token).

    Use When:
        - Seeing what models can be trained or used for predictions
        - Validating a model_type before starting training
    Do Not Use When:
        - The user has asked specifically for 'annotators' or 'automated annotators' - use get_annotator_types instead
        - You need model training parameters - use get_model_training_schema instead
        - You need model prediction parameters - use get_model_prediction_schema instead
        - ML models are not enabled - this endpoint returns an error if ML is disabled
    Example User Requests:
        - "What ML models are available for time-series tasks?"
        - "Can I train a disruption detection model for this project?"
    """
    return ModelRegistry.names(task)


@router.get(
    "/models/load",
    operation_id="get_model_load_methods",
    tags=["MCP"],
    dependencies=[Depends(check_models_enabled)],
)
async def get_model_load_methods() -> list[str]:
    """
    Get a list of enabled methods for loading pretrained ML model weights
    into the server (local path, GitLab, Hugging Face).

    Returns
    -------
    list[str]
        A list of enabled load method strings (e.g. ["local", "huggingface"]).

    Notes
    -----
    Requires an active authenticated user (browser session or bearer token).

    Use When:
        - You want to know which weight loading methods are configured and available
        - You are planning to load model weights and need to choose a method
    Do Not Use When:
        - You want to actually load model weights - use load_model_weights_local, load_model_weights_gitlab, or load_model_weights_hugging_face instead
        - You need a list of available model types for the given project/task - use get_model_types instead
        - ML models are not enabled - this endpoint returns an error if ML is disabled
    Example User Requests:
        - "What methods are available for loading model weights?"
        - "Can I load models from Hugging Face?"
    """
    enabled = []
    if config.settings.models.local_load_enabled:
        enabled.append(LoadMethods.LOCAL)
    if config.settings.models.gitlab_load_enabled:
        enabled.append(LoadMethods.GITLAB)
    if config.settings.models.huggingface_load_enabled:
        enabled.append(LoadMethods.HUGGINGFACE)

    return enabled


@router.get(
    "/models/load/{load_method}",
    operation_id="get_model_load_method_allowlist",
    tags=["MCP"],
    dependencies=[Depends(check_models_enabled)],
)
async def get_model_load_method_allowlist(load_method: LoadMethods) -> str | None:
    """
    Get the allowed project/organization ID for loading models from online
    projects, if applicable to the specified load method (GitLab project ID,
    or Hugging Face userspace).

    This may be set on the server for enhanced security, or is None if any
    user specified project ID / userspace is accepted.

    Parameters
    ----------
    load_method : LoadMethods
        The model load method to check the allowlist for.

    Returns
    -------
    str | None
        A string (project ID or userspace) if selection is restricted by the
        server, or None if no restriction applies.

    Notes
    -----
    Requires an active authenticated user (browser session or bearer token).

    Use When:
        - You need the GitLab project ID before calling the GitLab weights loader
        - You need the Hugging Face userspace/organization before loading from HuggingFace
    Do Not Use When:
        - You want to load weights directly - use load_model_weights_gitlab or load_model_weights_hugging_face instead
        - You need the list of enabled load methods - use get_model_load_methods instead
        - ML models are not enabled - this endpoint returns an error if ML is disabled
    Example User Requests:
        - "What GitLab projects can I load models from?"
        - "Which Hugging Face userspace(s) can I load models from?"
        - "Can I load an ML model from my personal gitlab project?"
        - "Can I load an ML model from the Ultralytics HuggingFace repository?"
    """
    match load_method:
        case LoadMethods.LOCAL:
            return None
        case LoadMethods.GITLAB:
            return (
                str(config.settings.models.gitlab_project_id)
                if config.settings.models.gitlab_project_id
                else None
            )
        case LoadMethods.HUGGINGFACE:
            return config.settings.models.huggingface_userspace


@router.get(
    "/models/{model}/train",
    operation_id="get_model_training_schema",
    tags=["MCP"],
    dependencies=[Depends(check_models_enabled)],
)
async def get_model_training_schema(model: str) -> dict[str, typing.Any] | None:
    """
    Get the required training parameter schema for a specific model type.

    Parameters
    ----------
    model : str
        The type of model to get the training schema for.

    Returns
    -------
    dict[str, typing.Any] | None
        A JSON schema dict describing required training parameters, or None
        if no parameters are required.

    Notes
    -----
    Requires an active authenticated user (browser session or bearer token).

    Use When:
        - You are about to start model training and need to know what parameters are required
        - You want to validate training parameters before calling the training endpoint
    Do Not Use When:
        - You want to actually train a model - use start_model_training instead
        - You need prediction parameters - use get_model_prediction_schema instead
    Example User Requests:
        - "What parameters do I need to train a disruption CNN model?"
    """
    return ModelRegistry.get_params_schema(
        model, schema_type="training", return_draft_07=True
    )


@router.get(
    "/models/{model}/predict",
    operation_id="get_model_prediction_schema",
    tags=["MCP"],
    dependencies=[Depends(check_models_enabled)],
)
async def get_model_prediction_schema(model: str) -> dict[str, typing.Any] | None:
    """
    Get the required prediction parameter schema for a specific model type.

    Parameters
    ----------
    model : str
        The type of model to get the prediction schema for.

    Returns
    -------
    dict[str, typing.Any] | None
        A JSON schema dict describing required prediction parameters, or None
        if no parameters are required.

    Notes
    -----
    Requires an active authenticated user (browser session or bearer token).

    Use When:
        - You are about to create model predictions and need to know what parameters are required
        - You want to validate prediction parameters before calling the prediction endpoint
    Do Not Use When:
        - You want to actually run predictions - use create_model_predictions or create_sample_model_predictions instead
        - You need training parameters - use get_model_training_schema instead
    Example User Requests:
        - "What parameters do I need to run predictions with the disruption CNN model?"
    """
    return ModelRegistry.get_params_schema(
        model, schema_type="prediction", return_draft_07=True
    )
