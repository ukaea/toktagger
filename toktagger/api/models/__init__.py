"""Contains code for implemented ML models."""

import importlib.util
from fastapi import HTTPException


def models_dependencies_installed() -> bool:
    return importlib.util.find_spec("ray") is not None


def check_models_enabled():
    if not models_dependencies_installed():
        raise HTTPException(
            status_code=503,
            detail="ML model features are disabled (optional dependencies missing)",
        )


if models_dependencies_installed():
    # These models only need base dependencies (numpy, scipy, scikit-learn, ray)
    # and are safe to import in Ray worker venvs that lack optional extras.
    from toktagger.api.models.dtw_motif import DTWMotifModel as DTWMotifModel
    from toktagger.api.models.stumpy_motif import StumpyMotifModel as StumpyMotifModel
    from toktagger.api.models.minirocket import MiniRocketModel as MiniRocketModel
    from toktagger.api.models.shapelet import (
        ShapeletTransformModel as ShapeletTransformModel,
    )

    # Torch-based models are only imported when torch is available, so that Ray
    # workers (which run in isolated venvs without torch) can still import
    # toktagger.api.models without hitting an ImportError.
    if importlib.util.find_spec("torch") is not None:
        from toktagger.api.models.disruption import DisruptionCNN as DisruptionCNN
        from toktagger.api.models.temp import VideoCNN as VideoCNN
