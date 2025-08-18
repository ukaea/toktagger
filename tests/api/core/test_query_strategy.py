import services.api.core.query_strategy as query_strategy
import tests.db_definitions as db_definitions
import pymongo
import pytest
import random
from fastapi import HTTPException
from services.api.schemas.samples import Sample
from services.api.schemas.annotations import AnnotationOutTypes
from pydantic import TypeAdapter

@pytest.mark.asyncio
async def test_sequential_strategy(setup_db, db_client):
    # Get samples from the database by their shot_id
    annotator_model = TypeAdapter(AnnotationOutTypes)
    samples = [Sample(**sample) for sample in await db_client.get_filtered_documents("samples", sort_by="shot_id", sort_direction="ascending")]
    annotations = [annotator_model.validate_python(annotation) for annotation in await db_client.get_filtered_documents("annotations", sort_by="uncertainty", sort_direction="descending", filters={"validated": False})]
    
    strategy = query_strategy.SequentialQueryStrategy(samples.copy(), annotations.copy())
    for i in range(len(samples)):
        next_sample = strategy.get_next_sample()
        assert next_sample == samples[i]
    # Should raise an error when you get to the end
    with pytest.raises(RuntimeError, match="No more samples to label!"):
        strategy.get_next_sample()
        

@pytest.mark.asyncio
async def test_random_strategy(setup_db, db_client):
    # Get samples from the database by their shot_id
    annotator_model = TypeAdapter(AnnotationOutTypes)
    samples = [Sample(**sample) for sample in await db_client.get_filtered_documents("samples", sort_by="shot_id", sort_direction="ascending")]
    annotations = [annotator_model.validate_python(annotation) for annotation in await db_client.get_filtered_documents("annotations", sort_by="uncertainty", sort_direction="descending", filters={"validated": False})]
    
    random.seed(42)
    strategy_1 = query_strategy.RandomQueryStrategy(samples.copy(), annotations.copy())
    returned_samples_1 = [strategy_1.get_next_sample() for i in range(len(samples))]
    # Should raise an error when you get to the end
    with pytest.raises(RuntimeError, match="No more samples to label!"):
        strategy_1.get_next_sample()
    
    random.seed(43)
    strategy_2 = query_strategy.RandomQueryStrategy(samples.copy(), annotations.copy())
    returned_samples_2 = [strategy_2.get_next_sample() for i in range(len(samples))]
    
    # Check that two instances have not returned the same order of results
    assert returned_samples_1 != returned_samples_2
    
    
@pytest.mark.asyncio
async def test_uncertainty_strategy(setup_db, db_client):
    # Get samples from the database by their shot_id
    annotator_model = TypeAdapter(AnnotationOutTypes)
    samples = [Sample(**sample) for sample in await db_client.get_filtered_documents("samples", sort_by="shot_id", sort_direction="ascending")]
    annotations = [annotator_model.validate_python(annotation) for annotation in await db_client.get_filtered_documents("annotations", sort_by="uncertainty", sort_direction="descending", filters={"validated": False})]
    
    strategy = query_strategy.UncertaintyQueryStrategy(samples.copy(), annotations.copy())
    
    # Should return annotations 5, 3, 4 in that order
    # These correspond to samples 4, 1, 2
    # It should then fallback to random selection of remaining samples - 3
    next_sample = strategy.get_next_sample()
    assert next_sample.id == setup_db["sample_id_4"]
    next_sample = strategy.get_next_sample()
    assert next_sample.id == setup_db["sample_id_1"]
    next_sample = strategy.get_next_sample()
    assert next_sample.id == setup_db["sample_id_2"]
    next_sample = strategy.get_next_sample()
    assert next_sample.id == setup_db["sample_id_3"]
    # Should raise an error when you get to the end
    with pytest.raises(RuntimeError, match="No more samples to label!"):
        strategy.get_next_sample()