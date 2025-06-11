import numpy as np
from abc import ABC, abstractmethod

from services.api.schemas.samples import Sample
from services.api.schemas.annotations import Annotation
from services.api.schemas.projects import QueryStrategyType

class QueryStrategy(ABC):
    def __init__(self, samples: list[Sample], annotations: list[Annotation]):
        # Samples should be listed by shot ID - low to high
        # Annotations should be listed by uncertaity, low to high (for consistency?)
        self.samples = samples
        self.annotations = annotations
    
    @abstractmethod
    def next_sample(self) -> Sample:
        pass


class RandomQueryStrategy(QueryStrategy):
    """Random query strategy

    Randomly chooses a sample as the next one to show to the user
    """

    def next_sample(self) -> Sample:
        if len(self.samples) == 0:
            raise RuntimeError("No more samples to label!")

        index = np.random.choice(len(self.samples), replace=False, size=1)
        return self.samples.pop(index)


class SequentialQueryStrategy(QueryStrategy):
    """Sequential query strategy

    Chooses the next sample from the ordered list of samples
    """

    def next_sample(self) -> Sample:
        if len(self.samples) == 0:
            raise RuntimeError("No more samples to label!")

        return self.samples.pop(0)

class UncertaintyQueryStrategy(QueryStrategy):
    def next_sample(self) -> Sample:
        if len(self.samples) == 0:
            raise RuntimeError("No more samples to label!")

        if len(self.annotations) == 0:
            print("Warning: No unvalidated annotations available - falling back to random sample selection.")
            index = np.random.choice(len(self.samples), replace=False, size=1)
        else:
            index = -1
        
        return self.samples.pop(index)
        
        
    
QUERY_STRATEGIES = {
    QueryStrategyType.RANDOM: RandomQueryStrategy,
    QueryStrategyType.SEQUENTIAL: SequentialQueryStrategy
}