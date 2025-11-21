import uvicorn
import os

if __name__ == "__main__":
    uvicorn.run(
        "toktagger.api.cli:app",
        host="0.0.0.0",
        port=8002,
        reload=True if os.environ.get("RELOAD") == "true" else False,
    )
