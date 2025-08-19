"""Contains code for implemented ML models.
"""
from services.api.core.models.disruption import DisruptionCNN

MODELS = {
    "disruption_cnn": DisruptionCNN,
}