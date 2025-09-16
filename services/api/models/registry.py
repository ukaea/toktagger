from services.api.models.disruption import DisruptionCNN

# Need this in here to avoid circular imports
MODELS = {
    "disruption_cnn": DisruptionCNN,
}
