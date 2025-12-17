from fastapi import APIRouter, Request
from toktagger.api.core.annotators import PeakDetectionAnnotator
from toktagger.api.core.data_loaders import LoaderRegistry
from toktagger.api.crud import utils
from toktagger.api.schemas.annotations import TimeRegion
from toktagger.api.schemas.annotators import AnnotatorParams, PeakDetectionParams
from toktagger.api.schemas.models import Model

router = APIRouter(prefix="/projects/{project_id}/models", tags=["Models"])


@router.get("")
async def get_models(project_id: str) -> list[Model]:
    # Return details about models being used by this project
    # Could be eg the ID, type of model, the accuracy, the version. link to mlflow / simvue instance, etc...
    pass


@router.post("")
async def create_model(project_id: str, params: Model):
    # Create a new model for this project
    # Creates (but doesnt train?) a new model and stores it somewhere
    # Returns the model ID for use later
    pass


@router.get("/{model_id}")
async def get_model(project_id: str, model_id: str) -> Model:
    # Return details about this specific model
    # Could be eg the type of model, the accuracy, the version. link to mlflow / simvue instance, etc...
    pass


@router.delete("/{model_id}")
async def delete_model(project_id: str, model_id: str, version: int = None):
    # Delete this model
    # If a specific version number is specified, just delete that version, else delete the whole thing
    pass


@router.get("/{model_id}/train")
async def get_training_info(project_id: str, model_id: str):
    # Get current status of model training
    pass


@router.put("/{model_id}/train")
async def train_model(project_id: str, model_id: str):
    # Start training of model
    # This triggers the ModelRunner, which goes and gets all validated samples from DB
    # Splits these into training / validation sets, passes to ModelWorker
    # ModelWorker then has an instance of a DataLoader which it uses to collect data for above samples
    # Retrains, tracked by mlflow / simvue
    # Once finished, runs inference over some set of samples and stores unvalidated results into DB
    # NON BLOCKING ENDPOINT, so does not wait for training to complete
    pass


@router.delete("/{model_id}/train")
async def stop_model_training(project_id: str, model_id: str):
    # Stop training of this model
    pass


@router.post("/{model_id}/predict")
async def predict(project_id: str, model_id: str):
    # Create predictions using the given model for this project
    # Predict on samples as specified by filters
    # Stores results in the database with validated=False
    pass


@router.post("/{model_id}/predict/{sample_id}")
async def predict_sample(
    request: Request,
    project_id: str,
    model_id: str,
    sample_id: str,
    params: PeakDetectionParams,
) -> list[TimeRegion]:
    db_client = request.app.state.db_client

    project = await utils.get_project(db_client, project_id)
    sample = await utils.get_sample(db_client, project_id, sample_id)

    data_loader = LoaderRegistry(project.data_loader)()
    data_item = data_loader.get_sample(sample.shot_id, sample.data)

    tagger = PeakDetectionAnnotator(params)
    annotations = tagger.predict(data_item)

    return annotations


@router.get("/{model_id}/predict")
async def get_predictions(
    request: Request, project_id: str, model_id: str, params: AnnotatorParams
):
    # Get predictions made using the given model for this project
    # Predict on samples as specified by filters
    pass


@router.delete("/{model_id}/predict")
async def delete_predictions(project_id: str, model_id: str):
    # Delete predictions using the given model for this project
    # Predict on samples as specified by filters
    pass


@router.get("/{model_id}/evaluate")
async def evaluate(project_id: str, model_id: str):
    # Get evaluation of model by comparing model predictions to human evaluations
    # Specify samples to use via filters
    # Return overall statistics, as well as correct/incorrect for each sample ID
    pass
