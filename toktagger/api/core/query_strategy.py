from abc import ABC
from typing import Optional

import numpy as np

from toktagger.api.schemas.samples import Sample
from toktagger.api.schemas.annotations import Annotation
from toktagger.api.schemas.projects import QueryStrategyType


class QueryStrategy(ABC):
    def __init__(self, samples: list[Sample], annotations: list[Annotation]):
        self.samples = samples
        self.annotations = annotations

    def get_next_sample(self, current_sample_id: Optional[str] = None) -> Sample:
        if current_sample_id is None:
            if len(self.samples) == 0:
                raise RuntimeError("No samples available!")
            return self.samples[0]

        index = self._get_matching_sample(current_sample_id)
        next_index = index + 1

        if next_index >= len(self.samples):
            raise RuntimeError("No more samples to label!")

        return self.samples[next_index]

    def get_previous_sample(self, current_sample_id: str) -> Sample:
        if current_sample_id is None:
            raise RuntimeError(
                "Current sample ID must be provided to get previous sample!"
            )

        index = self._get_matching_sample(current_sample_id)
        previous_index = index - 1

        if previous_index < 0:
            raise RuntimeError("No previous sample available!")

        return self.samples[previous_index]

    def _get_matching_sample(self, current_sample_id: Optional[str]) -> int:
        index = next(
            (
                i
                for i, sample in enumerate(self.samples)
                if sample.id == current_sample_id
            ),
            None,
        )
        if index is None:
            raise RuntimeError("Current sample ID not found in the list of samples.")
        return index


class SequentialQueryStrategy(QueryStrategy):
    """Sequential query strategy

    Chooses the next sample from the ordered list of samples
    """


class RandomQueryStrategy(QueryStrategy):
    """Random query strategy

    Randomly chooses a sample as the next one to show to the user
    """

    def __init__(
        self, samples: list[Sample], annotations: list[Annotation] = [], seed: int = 42
    ):
        super().__init__(samples, annotations)
        # simply shuffle the samples at the start
        # seed is used to ensure consistent shuffling between calls
        self._random_shuffle_samples(seed)

    def _random_shuffle_samples(self, seed: int):
        idx = np.arange(len(self.samples))
        rng = np.random.default_rng(seed=seed)
        rng.shuffle(idx)
        self.samples = [self.samples[i] for i in idx]


class UncertaintyQueryStrategy(RandomQueryStrategy):
    """Uncertainty-based query strategy

    Chooses the next sample based on uncertainty scores from existing annotations.
    If no annotations exist, falls back to random sampling.
    """

    def __init__(self, samples, annotations, seed: int = 42):
        super().__init__(samples, annotations)

        if len(self.annotations) == 0:
            self._random_shuffle_samples(seed)
        else:
            self.annotations = sorted(
                self.annotations, key=lambda ann: ann.uncertainty, reverse=True
            )
            sample_ids = [annotation.sample_id for annotation in self.annotations]
            self.samples = sorted(
                self.samples,
                key=lambda sample: sample_ids.index(sample.id)
                if sample.id in sample_ids
                else -1,
                reverse=True,
            )


QUERY_STRATEGIES = {
    QueryStrategyType.RANDOM: RandomQueryStrategy,
    QueryStrategyType.SEQUENTIAL: SequentialQueryStrategy,
    QueryStrategyType.UNCERTAINTY: UncertaintyQueryStrategy,
}
