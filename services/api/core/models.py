
from services.api.schemas.projects import Task
class Model():
    
    def train(self):
        # pass in list of samples and list of annotations
        pass
    
    def predict(self):
        # pass in list of samples and list of annotations (could be size 1)
        pass
    
    def save(self):
        pass
    
    def load(self):
        pass
    
class UFOCNN(Model):
    pass


MODELS = {
    Task.UFO: UFOCNN,
}