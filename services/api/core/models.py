
from services.api.schemas.projects import Task
from services.api.schemas.samples import Sample
from services.api.schemas.annotations import Annotation, TimePoint
from services.api.schemas.projects import Project
from services.api.schemas.data import Data, TimeSeriesData
from services.api.core.data_loaders import DATA_LOADERS

from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, root_mean_squared_error

from abc import ABC, abstractmethod
import torch.nn as nn
import torch
from torch.utils.data import DataLoader

class Model(ABC):
    def __init__(self, project: Project, samples: list[Sample], annotations: list[list[Annotation]] | None = None) -> None:
        self.samples = samples
        
        if not annotations:
            self.annotations = None
            
        elif len(samples) != len(annotations):
            raise ValueError("Annotations missing for some samples!")

        else:
            self.annotations = annotations
            
        self.data_loader = DATA_LOADERS[project.data_loader]() # TODO: Change name of this to prevent confusion
        self.model = self._define_model()
        
        
    def __len__(self) -> int:
        return len(self.samples)
    
    @abstractmethod
    def __getitem__(self, idx: int): # TODO: do we know what this returns?
        pass
    
    @abstractmethod
    def _define_model(self):
        pass
    
    @abstractmethod
    def train(self, epochs: int):
        # pass in list of samples and list of annotations
        pass
    
    @abstractmethod
    def predict(self):
        # pass in list of samples and list of annotations (could be size 1)
        pass
    
    @abstractmethod
    def save(self, file_path: str):
        pass
    
    @abstractmethod
    def load(cls, file_path: str):
        pass
    
class DisruptionCNN(Model):
    def __init__(self, project: Project, samples: list[Sample], annotations: list[list[Annotation]] | None = None) -> None:
        self.current_scaling = []
        self.time_scaling = []
        super().__init__(project=project, samples=samples, annotations=annotations)
        
    def save(self, file_path: str):
        torch.save(self.model.state_dict(), file_path)

    def load(self, file_path: str):
        self.model.load_state_dict(torch.load(file_path))
        
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
        #return torch.tensor(data.values, dtype=torch.float32), data.time.index(disruption_time)
        return plasma_current, disruption_time / data.time[-1]
        
        # Processing of data array? TODO
        
        
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
        
    def train(self, num_epochs: int, batch_size: int, device='cpu'):
        criterion = nn.MSELoss()
        optimizer = torch.optim.Adam(self.model.parameters(), lr=1e-3)
        
        dataloader = DataLoader(self, batch_size=batch_size, shuffle=True)
        
        loss_history = {"train": [], "val": []}
        print_per_epoch = max(1, num_epochs // 50) # print 50 times
        
        for epoch in range(num_epochs):
            self.model.train()
            total_train_loss = 0
            y_train_true, y_train_pred = [], []
            
            for batch_samples, batch_annotations in dataloader:
                batch_samples = batch_samples.unsqueeze(1) 
                batch_samples = batch_samples.to(device)    
                batch_annotations = batch_annotations.float().to(device)     

                outputs = self.model(batch_samples).squeeze(1)         
                loss = criterion(outputs, batch_annotations) # 1 loss value as summation of all 5 outputs

                total_train_loss += loss.item()
                y_train_true.extend(batch_annotations.cpu().numpy())
                y_train_pred.extend(outputs.detach().cpu().numpy())

                optimizer.zero_grad()
                loss.backward()  # all gradients backpropped through all 5 output neurons
                optimizer.step()

            train_loss_avg = total_train_loss / len(dataloader)
            train_mae = mean_absolute_error(y_train_true, y_train_pred)
            train_rmse = root_mean_squared_error(y_train_true, y_train_pred)
            
            loss_history["train"].append(train_loss_avg)
            # loss_history["val"].append(val_loss_avg)
            
            if epoch % print_per_epoch == 0:
                print(f"Epoch [{epoch + 1}/{num_epochs}]")
                print(f"  Train Loss: {train_loss_avg:.4f}, MAE: {train_mae:.4f}, RMSE: {train_rmse:.4f}")
                # print(f"  Val   Loss: {val_loss_avg:.4f}, MAE: {val_mae:.4f}, RMSE: {val_rmse:.4f}")
            
        # TODO: Val? Using Dataset? what to do?
        
        # TODO: early stopping
        
        return loss_history
    
    def predict(self, batch_size: int, device='cpu'):
        self.model.train() # Using dropout so has to be in train mode
        all_predictions: list[list[torch.tensor]] = []
        dataloader = DataLoader(self, batch_size=batch_size, shuffle=True)
    
        for i in range(50): # Should let user choose num mc samples? TODO
            predictions: list[torch.tensor] = []
            with torch.no_grad():
                for batch_samples in dataloader:
                    batch_samples = batch_samples.unsqueeze(1) 
                    batch_samples = batch_samples.to(device)
                    predictions.append(self.model(batch_samples))
                    
            all_predictions.append(torch.cat(predictions, dim=0))
            
        stacked_predictions = torch.stack(all_predictions)
        return stacked_predictions.mean(dim=0).squeeze() * torch.tensor(self.time_scaling[:int(len(self.time_scaling)/50)]).squeeze(), stacked_predictions.var(dim=0).squeeze()
    
    def predict_no_dropout(self, batch_size: int, device='cpu'):
        self.model.eval() # Using dropout so has to be in train mode
        predictions: list[torch.tensor] = []
        dataloader = DataLoader(self, batch_size=batch_size)
        with torch.no_grad():
            for batch_samples in dataloader:
                batch_samples = batch_samples.unsqueeze(1) 
                batch_samples = batch_samples.to(device)
                predictions.append(self.model(batch_samples))
        print(self.time_scaling)         
        return torch.cat(predictions, dim=0).squeeze() * torch.tensor(self.time_scaling).squeeze()
            
            
            
        
                
        
    



MODELS = {
    Task.DISRUPTION: DisruptionCNN,
}