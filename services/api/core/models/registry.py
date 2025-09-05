from services.api.core.models.disruption import DisruptionCNN

# Need this in here to avoid circular imports
MODELS = {
    "disruption_cnn": DisruptionCNN,
}