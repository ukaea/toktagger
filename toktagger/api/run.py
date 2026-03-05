import uvicorn
import os
import toktagger.api.cli

if __name__ == "__main__":
    toktagger.api.cli.server._setup_ray(
        "http://0.0.0.0:8002", os.environ.get("MODEL_STORAGE")
    )
    uvicorn.run(
        "toktagger.api.cli:app",
        host="0.0.0.0",
        port=8002,
        reload=True if os.environ.get("RELOAD") == "true" else False,
    )
