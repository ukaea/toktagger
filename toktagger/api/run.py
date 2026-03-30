import uvicorn
import os
import toktagger.api.cli
from toktagger.api.models import models_dependencies_installed

if __name__ == "__main__":
    if models_dependencies_installed():
        toktagger.api.cli.server._setup_ray(
            "http://0.0.0.0:8002", os.environ.get("MODEL_STORAGE")
        )
    uvicorn.run(
        "toktagger.api.cli:app",
        host="0.0.0.0",
        port=8002,
        reload=True if os.environ.get("RELOAD") == "true" else False,
    )
