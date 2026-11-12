from fastapi import APIRouter, Depends, Request

from toktagger.api.auth.dependencies import get_current_user
from toktagger.api.crud import utils

router = APIRouter(
    prefix="/paths", tags=["Paths"], dependencies=[Depends(get_current_user)]
)


@router.get("/files", response_model=list[str], operation_id="get_files")
async def get_files(request: Request, dir_path: str, file_type: str) -> list[str]:
    """
    Get a list of file names within the specified directory.

    Parameters
    ----------
    dir_path : str
        The directory to list files from.
    file_type : str
        The file extension to filter by.

    Returns
    -------
    list[str]
        A list of file names within the specified directory.

    Notes
    -----
    Requires an active authenticated user (browser session or bearer token).

    This endpoint is not exposed to the MCP server.
    """
    file_names = await utils.get_files(dir_path, file_type)
    return file_names


@router.get("/directories", response_model=list[str], operation_id="get_directories")
async def get_directories(request: Request, dir_path: str, file_type: str) -> list[str]:
    """
    Get a list of directories within the specified path, filtered by file type.

    Parameters
    ----------
    dir_path : str
        The path to list directories from.
    file_type : str
        The file extension to filter directories by.

    Returns
    -------
    list[str]
        A list of directory names within the specified path, filtered by file type.

    Notes
    -----
    Requires an active authenticated user (browser session or bearer token).

    This endpoint is not exposed to the MCP server.
    """
    dir_names = await utils.get_directories(dir_path)
    filtered_dirs = await utils.filter_directories_by_file_type(dir_names, file_type)
    return filtered_dirs
