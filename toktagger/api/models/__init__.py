"""Contains code for implemented ML models."""

import importlib.util


def models_dependencies_installed() -> bool:
    return importlib.util.find_spec("ray") is not None


if models_dependencies_installed():
    from toktagger.api.models.disruption import DisruptionCNN as DisruptionCNN
