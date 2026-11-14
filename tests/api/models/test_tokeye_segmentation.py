import pytest

pytest.importorskip("ray")
pytest.importorskip("tokeye")

import numpy as np
import torch

from toktagger.api.models import tokeye_segmentation
from toktagger.api.models.base import ModelRegistry
from toktagger.api.schemas.annotations import Polygon
from toktagger.api.schemas.data import (
    MultiProfile2DData,
    MultiVariateTimeSeriesData,
    Profile2DData,
    TimeSeriesData,
)
from toktagger.api.schemas.samples import Sample, ShotData


class FakeDataLoader:
    def __init__(self, data):
        self.data = data

    def get_sample(self, sample, params):
        return self.data


def make_sample() -> Sample:
    return Sample(
        shot_id=30421,
        data=ShotData(protocol="uda", signal_names=["mirnov"]),
        _id="sample",
        project_id="project",
        validated_annotations=False,
    )


def make_model(data) -> tokeye_segmentation.TokEyeSegmentation:
    torch.manual_seed(0)
    model = object.__new__(tokeye_segmentation.TokEyeSegmentation)
    model.model = model.define_model()
    model.data_loader = FakeDataLoader(data)
    return model


def chirp_signal() -> TimeSeriesData:
    sample_rate = 50_000
    time = 0.1 + np.arange(20_000) / sample_rate
    frequency = 2_000 + 10_000 * (time - time[0])
    values = np.sin(2 * np.pi * np.cumsum(frequency) / sample_rate)
    return TimeSeriesData(time=time.tolist(), values=values.tolist())


def assert_polygons_inside(
    predictions, time_bounds, dim_1_bounds, labels=("coherent", "transient")
):
    assert len(predictions) == 1
    assert predictions[0]
    for annotation in predictions[0]:
        assert isinstance(annotation, Polygon)
        assert annotation.label in labels
        assert annotation.signal_name == "mirnov"
        assert 0 <= annotation.uncertainty <= 1
        xs = annotation.segmentation[0][0::2]
        ys = annotation.segmentation[0][1::2]
        assert time_bounds[0] <= min(xs) and max(xs) <= time_bounds[1]
        assert dim_1_bounds[0] <= min(ys) and max(ys) <= dim_1_bounds[1]


def blob_scores(spectrogram: np.ndarray) -> np.ndarray:
    """Fixed TokEye-shaped scores: one coherent and one transient blob."""
    height, width = spectrogram.shape
    scores = np.zeros((2, height, width), dtype=np.float32)
    scores[0, height // 4 : height // 2, width // 4 : width // 2] = 0.9
    scores[1, 3 * height // 4 :, 3 * width // 4 :] = 0.8
    return scores


@pytest.fixture
def fake_infer(monkeypatch):
    shapes = []

    def infer(model, spectrogram, device):
        shapes.append(spectrogram.shape)
        return blob_scores(spectrogram)

    monkeypatch.setattr(tokeye_segmentation, "infer", infer)
    return shapes


def test_predict_time_series_returns_polygons_in_data_coordinates(fake_infer):
    signal = chirp_signal()
    model = make_model(MultiVariateTimeSeriesData(values={"mirnov": signal}))
    params = tokeye_segmentation.TokEyePredictParams(signal_name="mirnov")

    predictions = model.predict([make_sample()], params)

    assert fake_infer == [(params.n_fft // 2, 1 + len(signal.time) // params.hop)]
    assert_polygons_inside(predictions, (signal.time[0], signal.time[-1]), (0, 25))
    assert sorted(annotation.label for annotation in predictions[0]) == [
        "coherent",
        "transient",
    ]
    coherent = next(a for a in predictions[0] if a.label == "coherent")
    assert coherent.uncertainty == pytest.approx(0.1)


def test_predict_profile_2d_uses_signal_axes(fake_infer):
    rng = np.random.default_rng(0)
    signal = Profile2DData(
        time=np.linspace(0.0, 0.5, 128).tolist(),
        dim_1=np.linspace(1.0, 200.0, 64).tolist(),
        values=rng.random((128, 64)).tolist(),
    )
    model = make_model(MultiProfile2DData(values={"mirnov": signal}))
    params = tokeye_segmentation.TokEyePredictParams(
        signal_name="mirnov", channels=["transient"]
    )

    predictions = model.predict([make_sample()], params)

    assert fake_infer == [(64, 128)]
    assert_polygons_inside(predictions, (0.375, 0.5), (150.0, 200.0), ("transient",))


def test_predict_runs_real_network_on_time_series():
    model = make_model(MultiVariateTimeSeriesData(values={"mirnov": chirp_signal()}))
    params = tokeye_segmentation.TokEyePredictParams(signal_name="mirnov")

    predictions = model.predict([make_sample()], params)

    assert len(predictions) == 1
    assert all(isinstance(annotation, Polygon) for annotation in predictions[0])


def test_predict_missing_signal_raises():
    model = make_model(MultiVariateTimeSeriesData(values={"other": chirp_signal()}))
    params = tokeye_segmentation.TokEyePredictParams(signal_name="mirnov")

    with pytest.raises(TypeError, match="mirnov"):
        model.predict([make_sample()], params)


def assert_same_weights(expected: torch.nn.Module, actual: torch.nn.Module):
    for expected_tensor, actual_tensor in zip(
        expected.state_dict().values(), actual.state_dict().values()
    ):
        assert torch.equal(expected_tensor, actual_tensor)


def test_save_load_round_trip(tmp_path):
    model = make_model(None)
    model.save(tmp_path)
    other = make_model(None)
    with torch.no_grad():
        for parameter in other.model.parameters():
            parameter.zero_()

    other.load(tmp_path)

    assert_same_weights(model.model, other.model)


def test_train_loads_pretrained_weights(tmp_path, monkeypatch):
    source = make_model(None)
    with torch.no_grad():
        for parameter in source.model.parameters():
            parameter.add_(1.0)
    weights_path = tmp_path / "big_tf_unet_251210.pt"
    torch.save(source.model.state_dict(), weights_path)
    monkeypatch.setattr(
        tokeye_segmentation, "download_model", lambda name: weights_path
    )
    statuses = []
    model = make_model(None)
    model.log_progress = lambda **kwargs: statuses.append(kwargs.get("status"))

    score = model.train([], [])

    assert score == 0.0
    assert statuses == ["training", "completed"]
    assert_same_weights(source.model, model.model)


def test_tokeye_is_registered_as_pretrained():
    assert ModelRegistry.is_pretrained("tokeye")
    assert not ModelRegistry.is_pretrained("disruption_cnn")
