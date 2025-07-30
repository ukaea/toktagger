
from services.api.schemas.samples import Sample
from services.api.schemas.annotations import Annotation, AnnotationIn, TimePoint
from services.api.schemas.projects import Project
from services.api.schemas.data import Data, TimeSeriesData
from services.api.core.data_loaders import DATA_LOADERS
from services.api.schemas.models import ModelUpdate

from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, root_mean_squared_error

from abc import ABC, abstractmethod
import torch.nn as nn
import torch
from torch.utils.data import DataLoader, Dataset
import typing
from services.api.crud.db import MongoDBClient
from bson.objectid import ObjectId

class Model(ABC):
    def __init__(
        self,
        db_client: MongoDBClient,
        db_id: ObjectId,
        project: Project, 
        samples: list[Sample], 
        annotations: list[list[Annotation]], 
        train_val_test_split: typing.Tuple[float, float, float]
        ) -> None:
        
        if len(samples) != len(annotations):
            raise ValueError("Annotations missing for some samples!")
        if not abs(sum(train_val_test_split) - 1) < 1e-8:
            raise ValueError("Ratios in train_val_test split must sum to 1!")
        if not train_val_test_split[0]:
            raise ValueError("Must be samples in the training set!")
        
        self.db_client = db_client
        self.db_id = db_id
        self.project = project
        self.model = self._define_model()
        
        # If train ratio is 1, no splitting required, just set train sets and return
        if train_val_test_split[0] == 1:
            self.train_samples = samples
            self.train_annotations = annotations
            self.val_samples = None
            self.val_annotations = None
            self.test_samples = None
            self.test_annotations = None
            return
        
        # Otherwise need to do some splitting, split into train set and (val + test) set
        train_samples, val_test_samples, train_annotations, val_test_annotations = train_test_split(
            samples, 
            annotations, 
            test_size=train_val_test_split[1] + train_val_test_split[2]
            )
        self.train_samples = train_samples
        self.train_annotations = train_annotations
        
        # If no validation split requested, return test set
        if not train_val_test_split[1]:
            self.val_samples = None
            self.val_annotations = None
            self.test_samples = val_test_samples
            self.test_annotations = val_test_annotations
        
        # If no test split requested, return val set
        elif not train_val_test_split[2]:
            self.val_samples = val_test_samples
            self.val_annotations = val_test_samples
            self.test_samples = None
            self.test_annotations = None
        
        # Otherwise split again and return both val and test sets
        else:
            self.val_samples, self.test_samples, self.val_annotations, self.test_annotations = train_test_split(
                val_test_samples, 
                val_test_annotations, 
                test_size= train_val_test_split[2] / (train_val_test_split[1] + train_val_test_split[2])
                )
    
    async def _update_progress(self, progress: float):
        updated_model = ModelUpdate(progress=progress)
        await self.db_client.update(collection="models", model=updated_model, object_id=self.db_id)
                
    @abstractmethod
    def _define_model(self):
        pass
    
    @abstractmethod
    async def train(self, epochs: int) -> float:
        # pass in list of samples and list of annotations
        # return some measure of accuracy
        pass
    
    @abstractmethod
    def predict(self, samples: list[Sample]) -> list[list[AnnotationIn]]:
        # pass in list of samples and list of annotations (could be size 1)
        # returns list / array / tensor of predictions and uncertainties
        pass
    
    @abstractmethod
    def save(self, file_path: str):
        pass
    
    @classmethod
    @abstractmethod
    def load(cls, project: Project, file_path: str):
        pass
    
class TorchDataset(ABC):
    def __init__(self, project: Project, samples: list[Sample], annotations: list[list[Annotation]] | None):
        self.data_loader = DATA_LOADERS[project.data_loader]()
        self.samples = samples
        self.annotations = annotations
        
    @abstractmethod
    def __len__(self) -> int:
        pass    
    
    @abstractmethod
    def __getitem__(self, idx): # TODO will this always return constant types?
        pass        

class TorchModel(Model):
    def __init__(
        self, 
        db_client: MongoDBClient,
        db_id: ObjectId,
        project: Project, 
        dataset: TorchDataset,
        samples: list[Sample], 
        annotations: list[list[Annotation]],
        train_val_test_split: typing.Tuple[float, float, float] = (0.7, 0.2, 0.1),
    ) -> None:
        super().__init__(db_client=db_client, db_id=db_id, project=project, samples=samples, annotations=annotations, train_val_test_split=train_val_test_split)
        self.dataset = dataset
        self.train_dataset = dataset(project, self.train_samples, self.train_annotations)
        self.val_dataset = dataset(project, self.val_samples, self.val_annotations) if self.val_samples else None
        self.test_dataset = dataset(project, self.test_samples, self.test_annotations) if self.test_samples else None
    
class DisruptionDataset(TorchDataset):
    def __init__(self, project, samples, annotations):
        self.current_scaling = []
        self.time_scaling = []
        super().__init__(project, samples, annotations)
        
    def __len__(self):
        return len(self.samples)
    
    def __getitem__(self, idx: int) -> tuple[torch.tensor, int]:
        data: TimeSeriesData = self.data_loader.get_sample(self.samples[idx]).values["ip"]
        # Scale data to be between 0 and 1...
        plasma_current = torch.tensor(data.values, dtype=torch.float32)
        self.current_scaling.append(plasma_current.max())
        plasma_current = plasma_current / plasma_current.max()
        self.time_scaling.append(data.time[-1])
        if not self.annotations:
            return plasma_current
        
        annotation: TimePoint = self.annotations[idx][0]
        disruption_time = annotation.time
        return plasma_current, disruption_time / data.time[-1]
        
class DisruptionCNN(TorchModel):
    def __init__(
        self,
        db_client: MongoDBClient,
        db_id: ObjectId,
        project: Project, 
        samples: list[Sample], 
        annotations: list[list[Annotation]],
        train_val_test_split: typing.Tuple[float, float, float] = (0.7, 0.2, 0.1),
    ) -> None:
        self.type = "disruption_cnn"
        super().__init__(db_client=db_client, db_id=db_id, project=project, dataset=DisruptionDataset, samples=samples, annotations=annotations, train_val_test_split=train_val_test_split)
        
    def _define_model(self):
        return nn.Sequential(
            nn.Conv1d(1, 16, kernel_size=5, padding=2),
            nn.LeakyReLU(),
            nn.MaxPool1d(2),

            nn.Conv1d(16, 32, kernel_size=5, padding=2),
            nn.LeakyReLU(),
            nn.MaxPool1d(2),

            nn.AdaptiveAvgPool1d(1),
            nn.Flatten(),

            nn.Dropout(0.1),
            nn.Linear(32, 1) # TODO: what if not all annotations present for all samples?
        )
        
    async def train(self, num_epochs: int, batch_size: int, patience=20, threshold=1e-4, device='cpu') -> float:        
        criterion = nn.MSELoss()
        optimizer = torch.optim.Adam(self.model.parameters(), lr=1e-3)
        if not self.train_samples or not self.train_annotations:
            raise ValueError("No samples or annotations found!")
        
        train_loader = DataLoader(self.train_dataset, batch_size=batch_size, shuffle=False)
        val_loader = DataLoader(self.val_dataset, batch_size=batch_size, shuffle=False) if self.val_dataset else None
        test_loader = DataLoader(self.test_dataset, batch_size=batch_size, shuffle=False) if self.test_dataset else None
        
        loss_history = {"train": [], "val": []}
        best_val_loss = float("inf")
        print_per_epoch = max(1, num_epochs // 50) # print 50 times
        
        for epoch in range(num_epochs):
            self.model.train()
            total_train_loss = 0
            y_train_true, y_train_pred = [], []
            
            for batch_samples, batch_annotations in train_loader:
                batch_samples = batch_samples.unsqueeze(1) 
                batch_samples = batch_samples.to(device)    
                batch_annotations = batch_annotations.float().to(device)     

                outputs = self.model(batch_samples).squeeze(1)         
                loss = criterion(outputs, batch_annotations)

                total_train_loss += loss.item()
                y_train_true.extend(batch_annotations.cpu().numpy())
                y_train_pred.extend(outputs.detach().cpu().numpy())

                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

            train_loss_avg = total_train_loss / len(self.train_dataset)
            train_mae = mean_absolute_error(y_train_true, y_train_pred)
            train_rmse = root_mean_squared_error(y_train_true, y_train_pred)
            
            
            # --- Validation phase ---
            if val_loader:
                self.model.eval()
                total_val_loss = 0
                y_val_true, y_val_pred = [], []

                with torch.no_grad():
                    for batch_samples, batch_annotations in val_loader:
                        
                        batch_samples = batch_samples.unsqueeze(1) 
                        batch_samples = batch_samples.to(device)    
                        batch_annotations = batch_annotations.float().to(device)

                        outputs = self.model(batch_samples).squeeze(1)         
                        loss = criterion(outputs, batch_annotations)

                        total_val_loss += loss.item()
                        y_val_true.extend(batch_annotations.cpu().numpy())
                        y_val_pred.extend(outputs.cpu().numpy())

                val_loss_avg = total_val_loss / len(val_loader)
                val_mae = mean_absolute_error(y_val_true, y_val_pred)
                val_rmse = root_mean_squared_error(y_val_true, y_val_pred)

                loss_history["train"].append(train_loss_avg)
                loss_history["val"].append(val_loss_avg)

                if epoch % print_per_epoch == 0:
                    print(f"Epoch [{epoch + 1}/{num_epochs}]")
                    print(f"  Train Loss: {train_loss_avg:.4f}, MAE: {train_mae:.4f}, RMSE: {train_rmse:.4f}")
                    print(f"  Val   Loss: {val_loss_avg:.4f}, MAE: {val_mae:.4f}, RMSE: {val_rmse:.4f}")
                    await self._update_progress((epoch+1) / num_epochs * 100)

            # --- Early stopping ---
            if val_loss_avg < best_val_loss - threshold:
                best_val_loss = val_loss_avg
                epochs_since_improvement = 0
                self.best_model = self.model
            else:
                epochs_since_improvement += 1
                if epochs_since_improvement >= patience:
                    print(f"No validation improvement for {patience} epochs. Stopping early.")
                    self.model = self.best_model
                    break
                
        # --- Evaluation on test set ---
        if test_loader:
            self.model.eval()
            sum_correct = 0
            sum_total = 0

            with torch.no_grad():
                for batch_samples, batch_annotations in test_loader:
                    
                    batch_samples = batch_samples.unsqueeze(1) 
                    batch_samples = batch_samples.to(device)    
                    batch_annotations = batch_annotations.float().to(device)

                    outputs = self.model(batch_samples).squeeze(1)
                    
                    error = torch.abs(outputs - batch_annotations)
                    print(outputs)
                    print(batch_annotations)
                    print(error)
                    correct = error <= 0.05*batch_annotations
                    sum_correct += correct.sum().item()
                    sum_total += batch_samples.size(0)
            
            print("Test Accuracy:", (sum_correct / sum_total) * 100)
                
        return (sum_correct / sum_total) * 100
    
    def predict(self, samples: list[Sample], batch_size: int, device='cpu') -> list[list[TimePoint]]:
        num_mc_samples = 20 # Should let user choose num mc samples? TODO
        dataset = self.dataset(self.project, samples, annotations=None)
        
        self.model.train() # Using dropout so has to be in train mode
        all_predictions: list[list[torch.tensor]] = []
        dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=False)
    
        for i in range(num_mc_samples):
            predictions: list[torch.tensor] = []
            with torch.no_grad():
                for batch_samples in dataloader:
                    batch_samples = batch_samples.unsqueeze(1) 
                    batch_samples = batch_samples.to(device)
                    predictions.append(self.model(batch_samples))
                    
            all_predictions.append(torch.cat(predictions, dim=0))
            
        stacked_predictions = torch.stack(all_predictions)
        # Because we've done 50x mc samples, just use the first lot of scaling values...
        scaling = torch.tensor(dataset.time_scaling[:int(len(dataset.time_scaling)/num_mc_samples)]).squeeze()
        means = stacked_predictions.mean(dim=0).squeeze(dim=1) * scaling
        stds = stacked_predictions.std(dim=0).squeeze(dim=1) * scaling
        return [
            [TimePoint(
                validated=False, 
                uncertainty=stds[i], 
                label="disruption",
                time=means[i],
                created_by=self.type
                )
             ]
            for i in range(len(samples))]
        
    def save(self, file_path: str):
        torch.save(self.model.state_dict(), file_path)

    @classmethod
    def load(cls, project: Project, file_path: str):
        instance = cls.__new__(cls)
        instance.type = "disruption_cnn"
        instance.project = project
        instance.train_samples = None
        instance.train_annotations = None
        instance.dataset = DisruptionDataset
        instance.model = instance._define_model()
        instance.model.load_state_dict(torch.load(file_path))
        return instance

MODELS = {
    "disruption_cnn": DisruptionCNN,
}