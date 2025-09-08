from tensorflow.keras.callbacks import Callback
from services.api.publisher import publish_progress
from services.api.schemas.models import ModelUpdate

class ModelProgress(Callback):
    def __init__(self, model_id: str, num_epochs: int):
        self.model_id = model_id
        self.num_epochs = num_epochs
        super().__init__()
    
    def on_train_begin(self):
        model_update = ModelUpdate(training_status="started", progress=0)
        publish_progress(
            id=self.model_id, 
            collection="models",
            updates=model_update
            )
        
    def on_epoch_end(self, epoch: int, logs: dict):
        model_update = ModelUpdate(
            progress=(epoch / self.num_epochs) * 100,
            accuracy = logs.get("val_accuracy") or logs.get("accuracy")
        )
        publish_progress(
            id=self.model_id, 
            collection="models",
            updates=model_update
            )
    
    def on_train_end(self, logs: dict):
        model_update = ModelUpdate(
            training_status="completed",
            progress=100,
            accuracy = logs.get("val_accuracy") or logs.get("accuracy")
        )
        publish_progress(
            id=self.model_id, 
            collection="models",
            updates=model_update
            )
    
    