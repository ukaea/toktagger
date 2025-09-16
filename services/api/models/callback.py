from tensorflow.keras.callbacks import Callback
from services.api.core.sender import send_model_updates
from services.api.schemas.models import ModelUpdate


class ModelProgress(Callback):
    def __init__(self, project_id: str, model_id: str, num_epochs: int):
        self.project_id = project_id
        self.model_id = model_id
        self.num_epochs = num_epochs
        super().__init__()

    def on_train_begin(self):
        model_update = ModelUpdate(training_status="started", progress=0)
        send_model_updates(
            project_id=self.project_id, model_id=self.model_id, updates=model_update
        )

    def on_epoch_end(self, epoch: int, logs: dict):
        model_update = ModelUpdate(
            progress=(epoch / self.num_epochs) * 100,
            accuracy=logs.get("val_accuracy") or logs.get("accuracy"),
        )
        send_model_updates(
            project_id=self.project_id, model_id=self.model_id, updates=model_update
        )

    def on_train_end(self, logs: dict):
        model_update = ModelUpdate(
            training_status="completed",
            progress=100,
            accuracy=logs.get("val_accuracy") or logs.get("accuracy"),
        )
        send_model_updates(
            project_id=self.project_id, model_id=self.model_id, updates=model_update
        )
