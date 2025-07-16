from pathlib import Path
from fastapi import APIRouter, Request

router = APIRouter(prefix="/files", tags=["Files"])


@router.get("")
async def get_files(request: Request, file_path: str, file_type: str) -> list[str]:
    file_names = Path(file_path).glob(f"*.{file_type}")
    file_names = map(str, file_names)
    file_names = list(sorted(file_names))
    return file_names
