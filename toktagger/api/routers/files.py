from fastapi import APIRouter, Request
from toktagger.api.crud import utils

router = APIRouter(prefix="/paths", tags=["Files"])


@router.get("/files", response_model=list[str])
async def get_files(request: Request, dir_path: str, file_type: str) -> list[str]:
    file_names = await utils.get_files(dir_path, file_type)
    return file_names


@router.get("/directories", response_model=list[str])
async def get_directories(request: Request, dir_path: str) -> list[str]:
    dir_names = await utils.get_directories(dir_path)
    return dir_names
