from abc import ABC
from typing import Optional

import numpy as np

from toktagger.api.schemas.samples import Sample
from toktagger.api.schemas.annotations import Annotation
from toktagger.api.schemas.projects import QueryStrategyType

import logging

logger = logging.getLogger(__name__)


class QueryStrategy(ABC):
    """Base class for query strategies"""

    def __init__(
        self,
        samples: list[Sample],
        annotations: Optional[list[Annotation]] = None,
    ):
        samples = sorted(samples, key=lambda s: s.shot_id)
        self.samples = samples
        self.annotations = annotations if annotations is not None else []

    def get_next_sample(self, seen_sample_ids: list[str]) -> Sample:
        """Get the next sample"""
        next_sample = next(
            (sample for sample in self.samples if sample.id not in seen_sample_ids),
            None,
        )
        if not next_sample:
            raise RuntimeError("No more samples available!")
        return next_sample

    def get_previous_sample(self, current_sample_id: Optional[str] = None) -> Sample:
        """Get the previous sample based on the current sample ID"""

        if current_sample_id is None:
            if len(self.samples) == 0:
                raise RuntimeError("No samples available!")
            return self.samples[-1]

        index = self._get_matching_sample(current_sample_id)
        previous_index = index - 1
        previous_index = previous_index % len(self.samples)

        return self.samples[previous_index]


class SequentialQueryStrategy(QueryStrategy):
    """Sequential query strategy

    Chooses the next sample from the ordered list of samples
    """


class RandomQueryStrategy(QueryStrategy):
    """Random query strategy

    Randomly chooses a sample as the next one to show to the user
    """

    def __init__(
        self,
        samples: list[Sample],
        annotations: Optional[list[Annotation]] = None,
        seed: int = 42,
    ):
        super().__init__(samples, annotations)
        # simply shuffle the samples at the start
        # seed is used to ensure consistent shuffling between calls
        self._random_shuffle_samples(seed)

    def _random_shuffle_samples(self, seed: int):
        rng = np.random.default_rng(seed=seed)
        self.samples = rng.permutation(self.samples)


class UncertaintyQueryStrategy(RandomQueryStrategy):
    """Uncertainty-based query strategy

    Chooses the next sample based on uncertainty scores from existing annotations.
    If no annotations exist, falls back to random sampling.
    """

    def __init__(
        self,
        samples: list[Sample],
        annotations: Optional[list[Annotation]] = None,
        seed: int = 42,
    ):
        super().__init__(samples, annotations, seed)

        if self.annotations is not None and len(self.annotations) != 0:
            self.annotations = sorted(
                self.annotations, key=lambda ann: ann.uncertainty, reverse=True
            )
            sample_ids = [annotation.sample_id for annotation in self.annotations]
            sample_ids = np.unique(sample_ids).tolist()
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
