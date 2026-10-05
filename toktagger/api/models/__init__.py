"""Contains code for implemented ML models."""

import importlib.util
import os
from fastapi import HTTPException


def models_dependencies_installed() -> bool:
    return importlib.util.find_spec("ray") is not None


# Ray re-launches workers via `uv run` to mirror the driver's env, which re-resolves the project from the worker's
# cwd and can crash workers with VIRTUAL_ENV mismatches (ModuleNotFoundError: ray); disable that so workers just
# reuse the driver's interpreter (a no-op otherwise, so always safe). Must be set before `ray` is imported, since
# Ray reads this env var at import time.
os.environ.setdefault("RAY_ENABLE_UV_RUN_RUNTIME_ENV", "0")


def check_models_enabled():
    if not models_dependencies_installed():
        raise HTTPException(
            status_code=503,
            detail="ML model features are disabled (optional dependencies missing)",
        )


if models_dependencies_installed():
    from toktagger.api.models.dtw_motif import DTWMotifModel as DTWMotifModel
    from toktagger.api.models.stumpy_motif import StumpyMotifModel as StumpyMotifModel
    from toktagger.api.models.minirocket import MiniRocketModel as MiniRocketModel
    from toktagger.api.models.shapelet import (
        ShapeletTransformModel as ShapeletTransformModel,
    )
    from toktagger.api.models.disruption import DisruptionCNN as DisruptionCNN
