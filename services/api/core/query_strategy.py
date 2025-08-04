import random
from abc import ABC, abstractmethod

from services.api.schemas.samples import Sample
from services.api.schemas.annotations import Annotation
from services.api.schemas.projects import QueryStrategyType

class QueryStrategy(ABC):
    def __init__(self, samples: list[Sample], annotations: list[Annotation]):
        # Samples should be listed by timestamp, high to low
        # Annotations should be listed by uncertaity, high to low
        self.samples = samples
        self.annotations = annotations
    
    @abstractmethod
    def get_next_sample(self) -> Sample:
        pass


class RandomQueryStrategy(QueryStrategy):
    """Random query strategy

    Randomly chooses a sample as the next one to show to the user
    """

    def get_next_sample(self) -> Sample:
        if len(self.samples) == 0:
            raise RuntimeError("No more samples to label!")

        index = random.randint(0, len(self.samples) - 1)
        return self.samples.pop(index)


class SequentialQueryStrategy(QueryStrategy):
    """Sequential query strategy

    Chooses the next sample from the ordered list of samples
    """

    def get_next_sample(self) -> Sample:
        if len(self.samples) == 0:
            raise RuntimeError("No more samples to label!")

        return self.samples.pop(0)

class UncertaintyQueryStrategy(QueryStrategy):
    def get_next_sample(self) -> Sample:
        if len(self.samples) == 0:
            raise RuntimeError("No more samples to label!")

        if len(self.annotations) == 0:
            print("Warning: No unvalidated annotations available - falling back to random sample selection.")
            index = random.randint(0, len(self.samples) - 1)
            return self.samples.pop(index)
        else:
            sample_id = self.annotations.pop(0).sample_id
            next_sample = next((sample for sample in self.samples if sample.id == sample_id), None)
            if not next_sample:
                print("Error: Most uncertain annotation does not link to a sample")
                index = random.randint(0, len(self.samples) - 1)
                return self.samples.pop(index)
            return next_sample
        
        
    
QUERY_STRATEGIES = {
    QueryStrategyType.RANDOM: RandomQueryStrategy,
    QueryStrategyType.SEQUENTIAL: SequentialQueryStrategy,
    QueryStrategyType.UNCERTAINTY: UncertaintyQueryStrategy
}