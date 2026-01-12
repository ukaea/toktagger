import uvicorn
import os

if __name__ == "__main__":
    os.environ["API_URL"] = "http://0.0.0.0:8002"
    uvicorn.run(
        "toktagger.api.cli:app",
        host="0.0.0.0",
        port=8002,
        reload=True if os.environ.get("RELOAD") == "true" else False,
    )
