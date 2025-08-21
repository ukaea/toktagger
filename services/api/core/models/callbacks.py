from tensorflow.keras.callbacks import Callback
import services.api.crud.utils as utils
from services.api.schemas.models import ModelUpdate
import asyncio
# We will use the Callback class from Tensorflow as the basis for the database and logging updates
# This means it will automatically work with Tensorflow models
# And need to be called manually inside PyTorch or other models

# Should do set_params where verbosity, batch size, number of epochs are provided

class DBCallback(Callback):
    def __init__(self, db_client, model_id):
        self.db_client = db_client
        self.model_id = model_id
        super().__init__()
        
    def on_train_begin(self, logs: dict):
        loop = asyncio.get_event_loop()
        loop.create_task(utils.update_model(self.db_client, self.model_id, ModelUpdate(training_status="started", progress=0, accuracy=0)))
    
    def on_train_end(self, logs: dict):
        accuracy = logs.get("val_accuracy") or logs.get("accuracy")
        loop = asyncio.get_event_loop()
        loop.create_task(utils.update_model(self.db_client, self.model_id, ModelUpdate(training_status="completed", accuracy=accuracy, progress=100)))
    
    def on_epoch_end(self, epoch: int, logs: dict):
        print("in hereee")
        progress = round(epoch / self.params["epochs"], 2)
        accuracy = logs.get("val_accuracy") or logs.get("accuracy")
        loop = asyncio.get_event_loop()
        loop.create_task(utils.update_model(self.db_client, self.model_id, ModelUpdate(training_status="started", accuracy=accuracy, progress=progress)))
        