from fastapi import APIRouter, Request
from services.api.crud import utils

router = APIRouter(prefix="/files", tags=["Files"])


@router.get("")
async def get_files(request: Request, dir_path: str, file_type: str) -> list[str]:
    file_names = await utils.get_files(dir_path, file_type)
    return file_names
