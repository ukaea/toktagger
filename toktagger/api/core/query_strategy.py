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
        self.samples = samples
        self.annotations = annotations if annotations is not None else []

    def get_next_sample(self, visited_sample_ids: list[str]) -> Sample:
        """Get the next sample"""
        next_sample = next(
            (sample for sample in self.samples if sample.id not in visited_sample_ids),
            None,
        )
        if not next_sample:
            raise RuntimeError("No more samples available!")
        return next_sample


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
        annotations_nonvalidated = [ann for ann in annotations if not ann.validated]
        super().__init__(samples, annotations_nonvalidated, seed)

        if self.annotations:
            self.annotations = sorted(
                self.annotations, key=lambda ann: ann.uncertainty, reverse=True
            )
            sample_ids = [annotation.sample_id for annotation in self.annotations]
            sample_ids = list(dict.fromkeys(sample_ids))
            # List of samples which have unvalidated annotations
            samples_nonvalidated = [
                sample for sample in self.samples if not sample.validated_annotations
            ]
            # Sort in order of annotation uncertainty, samples with no annotations go last (randomised)
            self.samples = sorted(
                samples_nonvalidated,
                key=lambda sample: sample_ids.index(sample.id)
                if sample.id in sample_ids
                else float("inf"),
            )
            # Then add in samples which *are* validated at the end
            self.samples += [
                sample for sample in self.samples if sample.validated_annotations
            ]


QUERY_STRATEGIES = {
    QueryStrategyType.RANDOM: RandomQueryStrategy,
    QueryStrategyType.SEQUENTIAL: SequentialQueryStrategy,
    QueryStrategyType.UNCERTAINTY: UncertaintyQueryStrategy,
}
