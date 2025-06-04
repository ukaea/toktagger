from fastapi import FastAPI
from services.api.routers.annotations import router as annotations_router
from services.api.routers.data import router as data_router
from services.api.routers.models import router as models_router
from services.api.routers.projects import router as projects_router
from services.api.routers.samples import router as samples_router
from services.api.crud.db import MongoDBClient


app = FastAPI()
app.include_router(annotations_router)
app.include_router(data_router)
app.include_router(models_router)
app.include_router(projects_router)
app.include_router(samples_router)

# MONGO_URL = os.environ["MONGO_URL"]
MONGO_URL = "mongodb://root:example@localhost:27017"
DATABASE_NAME = "annotate_db"
COLLECTION_NAME = "shots"

@app.on_event("startup")
async def on_startup():
    global db_client
    db_client = MongoDBClient(MONGO_URL, DATABASE_NAME)