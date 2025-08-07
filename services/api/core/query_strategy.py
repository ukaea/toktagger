from abc import ABC
from typing import Optional

import numpy as np

from services.api.schemas.samples import Sample
from services.api.schemas.annotations import Annotation
from services.api.schemas.projects import QueryStrategyType


class QueryStrategy(ABC):
    def __init__(self, samples: list[Sample], annotations: list[Annotation]):
        self.samples = samples
        self.annotations = annotations

    def get_next_sample(self, current_sample_id: Optional[str]) -> Sample:
        index = self._get_matching_sample(current_sample_id)
        next_index = index + 1

        if next_index >= len(self.samples):
            raise RuntimeError("No more samples to label!")

        return self.samples[next_index]

    def get_previous_sample(self, current_sample_id: Optional[str]) -> Sample:
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
        self, samples: list[Sample], annotations: list[Annotation], seed: int = 42
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


class UncertaintyQueryStrategy(QueryStrategy):
    def get_next_sample(self, current_sample_id: Optional[str]) -> Sample:
        raise NotImplementedError(
            "UncertaintyQueryStrategy requires a specific implementation for get_next_sample."
        )

    def get_previous_sample(self, current_sample_id: Optional[str]) -> Sample:
        raise NotImplementedError(
            "UncertaintyQueryStrategy requires a specific implementation for get_previous_sample."
        )


QUERY_STRATEGIES = {
    QueryStrategyType.RANDOM: RandomQueryStrategy,
    QueryStrategyType.SEQUENTIAL: SequentialQueryStrategy,
    QueryStrategyType.UNCERTAINTY: UncertaintyQueryStrategy,
}
