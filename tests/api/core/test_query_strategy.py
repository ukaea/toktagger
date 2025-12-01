import toktagger.api.core.query_strategy as query_strategy
import pytest
import random
from toktagger.api.schemas.samples import Sample
from toktagger.api.schemas.annotations import TimePointOut
import tests.db_definitions as db_definitions


@pytest.fixture
def samples():
    # Samples, sorted by shot_id, ascending
    sample_ins = [
        db_definitions.SAMPLE_1,
        db_definitions.SAMPLE_3,
        db_definitions.SAMPLE_1,
        db_definitions.SAMPLE_4,
    ]
    samples = [
        Sample(**sample_in.model_dump(), project_id="test", _id="test")
        for sample_in in sample_ins
    ]
    # Attach IDs to these - this would normally be done by the database
    for i in range(len(samples)):
        samples[i].id = f"sample_{i + 1}"

    return samples


@pytest.fixture
def annotations():
    # Annotations, sorted by uncertainty, descending. Only non-validated.
    annotation_ins = [
        db_definitions.ANNOTATION_5,
        db_definitions.ANNOTATION_3,
        db_definitions.ANNOTATION_4,
    ]
    annotations = [
        TimePointOut(
            **annotation_in.model_dump(),
            project_id="test",
            sample_id="test",
            _id="test",
        )
        for annotation_in in annotation_ins
    ]
    # Attach sample IDs to these which would normally be done by the database
    annotations[0].sample_id = "sample_4"
    annotations[1].sample_id = "sample_1"
    annotations[2].sample_id = "sample_2"
    return annotations


def test_sequential_strategy(samples, annotations):
    strategy = query_strategy.SequentialQueryStrategy(
        samples.copy(), annotations.copy()
    )
    for i in range(len(samples)):
        next_sample = strategy.get_next_sample()
        assert next_sample == samples[i]
    # Should raise an error when you get to the end
    with pytest.raises(RuntimeError, match="No more samples to label!"):
        strategy.get_next_sample()


def test_random_strategy(samples, annotations):
    random.seed(42)
    strategy_1 = query_strategy.RandomQueryStrategy(samples.copy(), annotations.copy())
    returned_samples_1 = [strategy_1.get_next_sample() for i in range(len(samples))]
    # Should raise an error when you get to the end
    with pytest.raises(RuntimeError, match="No more samples to label!"):
        strategy_1.get_next_sample()

    strategy_2 = query_strategy.RandomQueryStrategy(samples.copy(), annotations.copy())
    returned_samples_2 = [strategy_2.get_next_sample() for i in range(len(samples))]

    # Check that two instances have not returned the same order of results
    assert returned_samples_1 != returned_samples_2


def test_uncertainty_strategy(samples, annotations):
    strategy = query_strategy.UncertaintyQueryStrategy(
        samples.copy(), annotations.copy()
    )

    # Should return annotations 5, 3, 4 in that order
    # These correspond to samples number 4, 1, 2
    # It should then fallback to random selection of remaining samples - 3
    next_sample = strategy.get_next_sample()
    assert next_sample.id == "sample_4"
    next_sample = strategy.get_next_sample()
    assert next_sample.id == "sample_1"
    next_sample = strategy.get_next_sample()
    assert next_sample.id == "sample_2"
    next_sample = strategy.get_next_sample()
    assert next_sample.id == "sample_3"
    # Should raise an error when you get to the end
    with pytest.raises(RuntimeError, match="No more samples to label!"):
        strategy.get_next_sample()
