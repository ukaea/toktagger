from services.api.schemas.samples import Sample
from services.api.schemas.annotations import TimePoint
from services.api.schemas.data import TimeSeriesData
from sklearn.metrics import mean_absolute_error, root_mean_squared_error
import torch.nn as nn
import torch
from torch.utils.data import DataLoader, Dataset
import ray
from services.api.schemas.annotations import Annotation
import typing
from services.api.core.data_loaders import DATA_LOADERS
from services.api.models.base import Model


class DisruptionDataset(Dataset):  # Inherit from torch.utils.dataset
    def __init__(self, project, samples, annotations):
        self.data_loader = DATA_LOADERS[project.data_loader]()
        self.samples = samples
        self.annotations = annotations
        self.current_scaling = []
        self.time_scaling = []

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx: int) -> tuple[torch.tensor, int]:
        data: TimeSeriesData = self.data_loader.get_sample(self.samples[idx]).values[
            "ip"
        ]
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


@ray.remote
class DisruptionCNN(Model):
    def define_model(self):
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
            nn.Linear(32, 1),
        )

    def train(
        self,
        samples: list[Sample],
        annotations: list[list[Annotation]],
        train_val_test_split: typing.Tuple[float, float, float],
        num_epochs: int = 100,
        # TODO extra kwargs, eg batch size?
        batch_size=32,
        patience=20,
        threshold=1e-4,
        device="cpu",
    ) -> float:
        self.log_progress(training_status="started")

        self.split_data(
            samples=samples,
            annotations=annotations,
            train_val_test_split=train_val_test_split,
        )

        self.train_dataset = DisruptionDataset(
            self.project, self.train_samples, self.train_annotations
        )
        self.val_dataset = (
            DisruptionDataset(self.project, self.val_samples, self.val_annotations)
            if self.val_samples
            else None
        )
        self.test_dataset = (
            DisruptionDataset(self.project, self.test_samples, self.test_annotations)
            if self.test_samples
            else None
        )
        train_loader = DataLoader(
            self.train_dataset, batch_size=batch_size, shuffle=False
        )
        val_loader = (
            DataLoader(self.val_dataset, batch_size=batch_size, shuffle=False)
            if self.val_dataset
            else None
        )
        test_loader = (
            DataLoader(self.test_dataset, batch_size=batch_size, shuffle=False)
            if self.test_dataset
            else None
        )

        criterion = nn.MSELoss()
        optimizer = torch.optim.Adam(self.model.parameters(), lr=1e-3)
        if not self.train_samples or not self.train_annotations:
            raise ValueError("No samples or annotations found!")

        loss_history = {"train": [], "val": []}
        best_val_loss = float("inf")
        print_per_epoch = max(1, num_epochs // 50)  # print 50 times

        train_accuracy = None
        val_accuracy = None
        test_accuracy = None

        for epoch in range(num_epochs):
            self.model.train()
            total_train_loss = 0
            sum_correct = 0
            sum_total = 0
            y_train_true, y_train_pred = [], []

            for batch_samples, batch_annotations in train_loader:
                batch_samples = batch_samples.unsqueeze(1)
                batch_samples = batch_samples.to(device)
                batch_annotations = batch_annotations.float().to(device)

                outputs = self.model(batch_samples).squeeze(1)
                loss = criterion(outputs, batch_annotations)
                error = torch.abs(outputs - batch_annotations)

                correct = error <= 0.05 * batch_annotations
                sum_correct += correct.sum().item()
                sum_total += batch_samples.size(0)
                train_accuracy = (sum_correct / sum_total) * 100

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
                sum_correct = 0
                sum_total = 0
                y_val_true, y_val_pred = [], []

                with torch.no_grad():
                    for batch_samples, batch_annotations in val_loader:
                        batch_samples = batch_samples.unsqueeze(1)
                        batch_samples = batch_samples.to(device)
                        batch_annotations = batch_annotations.float().to(device)

                        outputs = self.model(batch_samples).squeeze(1)
                        loss = criterion(outputs, batch_annotations)
                        error = torch.abs(outputs - batch_annotations)

                        correct = error <= 0.05 * batch_annotations
                        sum_correct += correct.sum().item()
                        sum_total += batch_samples.size(0)
                        val_accuracy = (sum_correct / sum_total) * 100

                        total_val_loss += loss.item()
                        y_val_true.extend(batch_annotations.cpu().numpy())
                        y_val_pred.extend(outputs.cpu().numpy())

                val_loss_avg = total_val_loss / len(val_loader)
                val_mae = mean_absolute_error(y_val_true, y_val_pred)
                val_rmse = root_mean_squared_error(y_val_true, y_val_pred)

                loss_history["train"].append(train_loss_avg)
                loss_history["val"].append(val_loss_avg)

                self.log_progress(
                    progress=int((epoch / num_epochs) * 100), score=val_accuracy
                )

                if epoch % print_per_epoch == 0:
                    print(f"Epoch [{epoch + 1}/{num_epochs}]")
                    print(
                        f"  Train Loss: {train_loss_avg:.4f}, MAE: {train_mae:.4f}, RMSE: {train_rmse:.4f}"
                    )
                    print(
                        f"  Val   Loss: {val_loss_avg:.4f}, MAE: {val_mae:.4f}, RMSE: {val_rmse:.4f}"
                    )

            # --- Early stopping ---
            if val_loss_avg < best_val_loss - threshold:
                best_val_loss = val_loss_avg
                epochs_since_improvement = 0
                self.best_model = self.model
            else:
                epochs_since_improvement += 1
                if epochs_since_improvement >= patience:
                    print(
                        f"No validation improvement for {patience} epochs. Stopping early."
                    )
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

                    correct = error <= 0.05 * batch_annotations
                    sum_correct += correct.sum().item()
                    sum_total += batch_samples.size(0)
                    test_accuracy = (sum_correct / sum_total) * 100

            print("Test Accuracy:", (sum_correct / sum_total) * 100)

        final_accuracy = test_accuracy or val_accuracy or train_accuracy

        self.log_progress(
            training_status="completed",
            progress=int((epoch / num_epochs) * 100),
            score=final_accuracy,
        )

        return final_accuracy

    def predict(
        self, samples: list[Sample], batch_size: int = 32, device="cpu"
    ) -> list[list[TimePoint]]:
        num_mc_samples = 20  # Should let user choose num mc samples? TODO
        dataset = DisruptionDataset(self.project, samples, annotations=None)

        self.model.train()  # Using dropout so has to be in train mode
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
        scaling = torch.tensor(
            dataset.time_scaling[: int(len(dataset.time_scaling) / num_mc_samples)]
        ).squeeze()
        means = stacked_predictions.mean(dim=0).squeeze(dim=1) * scaling
        stds = stacked_predictions.std(dim=0).squeeze(dim=1) * scaling
        return [
            [
                TimePoint(
                    validated=False,
                    uncertainty=stds[i],
                    label="Disruption",
                    time=means[i],
                    created_by=self.type,
                )
            ]
            for i in range(len(samples))
        ]

    def save(self, file_path: str):
        torch.save(self.model.state_dict(), file_path)

    def load(self, file_path: str):
        self.model.load_state_dict(torch.load(file_path))
