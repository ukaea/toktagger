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
        db_definitions.SAMPLE_2,
        db_definitions.SAMPLE_3,
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

    next_sample_id = None

    for i in range(len(samples)):
        next_sample = strategy.get_next_sample(next_sample_id)
        next_sample_id = next_sample.id
        assert next_sample == samples[i]

    # Should cycle back to start
    next_sample = strategy.get_next_sample(next_sample_id)
    assert next_sample == samples[0]


def test_sequential_strategy_previous(samples, annotations):
    strategy = query_strategy.SequentialQueryStrategy(
        samples.copy(), annotations.copy()
    )

    # Start from the last sample and go backwards
    previous_sample_id = None
    for i in range(len(samples) - 1, -1, -1):
        previous_sample = strategy.get_previous_sample(previous_sample_id)
        previous_sample_id = previous_sample.id
        assert previous_sample == samples[i]

    # Should cycle back to end
    previous_sample = strategy.get_previous_sample(previous_sample_id)
    assert previous_sample == samples[-1]


def test_random_strategy_previous(samples, annotations):
    random.seed(42)
    strategy = query_strategy.RandomQueryStrategy(samples.copy(), annotations.copy())

    # Get all samples going forward first to know the order
    next_sample_id = None
    forward_samples = []
    for i in range(len(samples)):
        next_sample = strategy.get_next_sample(next_sample_id)
        forward_samples.append(next_sample)
        next_sample_id = next_sample.id

    # Now go backwards and verify we get the reverse order
    previous_sample_id = None
    for i in range(len(forward_samples) - 1, -1, -1):
        previous_sample = strategy.get_previous_sample(previous_sample_id)
        previous_sample_id = previous_sample.id
        assert previous_sample == forward_samples[i]


def test_uncertainty_strategy_previous(samples, annotations):
    strategy = query_strategy.UncertaintyQueryStrategy(
        samples.copy(), annotations.copy()
    )

    # Should return samples in reverse order: 3, 4, 1, 2
    previous_sample = strategy.get_previous_sample()
    assert previous_sample.id == "sample_3"
    previous_sample = strategy.get_previous_sample("sample_3")
    assert previous_sample.id == "sample_4"
    previous_sample = strategy.get_previous_sample("sample_4")
    assert previous_sample.id == "sample_1"
    previous_sample = strategy.get_previous_sample("sample_1")
    assert previous_sample.id == "sample_2"

    # Should cycle back to end
    previous_sample = strategy.get_previous_sample("sample_2")
    assert previous_sample.id == "sample_3"


def test_random_strategy(samples, annotations):
    random.seed(42)
    strategy_1 = query_strategy.RandomQueryStrategy(samples.copy(), annotations.copy())

    next_sample_id = None
    random_samples = []
    for i in range(len(samples)):
        next_sample = strategy_1.get_next_sample(next_sample_id)
        random_samples.append(next_sample)
        next_sample_id = next_sample.id

    assert len(random_samples) == len(samples)
    assert random_samples != samples


def test_uncertainty_strategy(samples, annotations):
    strategy = query_strategy.UncertaintyQueryStrategy(
        samples.copy(), annotations.copy()
    )

    # Should return annotations 5, 3, 4 in that order
    # These correspond to samples number 4, 1, 2
    # It should then fallback to random selection of remaining samples - 3
    next_sample = strategy.get_next_sample()
    assert next_sample.id == "sample_2"
    next_sample = strategy.get_next_sample("sample_2")
    assert next_sample.id == "sample_1"
    next_sample = strategy.get_next_sample("sample_1")
    assert next_sample.id == "sample_4"
    next_sample = strategy.get_next_sample("sample_4")
    assert next_sample.id == "sample_3"

    # Should cycle back to start
    next_sample = strategy.get_next_sample("sample_3")
    assert next_sample.id == "sample_2"
