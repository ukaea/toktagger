
from services.api.schemas.projects import Task
class Model():
    
    def train(self):
        pass
    
    def retrain(self):
        pass
    
    def predict(self):
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