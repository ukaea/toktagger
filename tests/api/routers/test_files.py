import os
from pathlib import Path
import tempfile
import pytest


@pytest.mark.asyncio
async def test_get_files(api_client, setup_db):
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create fake parquet files
        Path(os.path.join(temp_dir, "file1.parquet")).touch()
        Path(os.path.join(temp_dir, "file2.parquet")).touch()
        Path(os.path.join(temp_dir, "file3.txt")).touch()  # Non-parquet file

        response = await api_client.get(
            f"/paths/files?dir_path={temp_dir}&file_type=parquet"
        )

        assert response.status_code == 200
        file_names = response.json()
        assert len(file_names) == 2


@pytest.mark.asyncio
async def test_get_directories(api_client, setup_db):
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create subdirectories
        Path(os.path.join(temp_dir, "dir1")).mkdir()
        Path(os.path.join(temp_dir, "dir2")).mkdir()
        Path(os.path.join(temp_dir, "dir3")).mkdir()
        # Create a file that should not be included
        Path(os.path.join(temp_dir, "file.txt")).touch()

        response = await api_client.get(f"/paths/directories?dir_path={temp_dir}")

        assert response.status_code == 200
        dir_names = response.json()
        assert len(dir_names) == 3
        # Verify directories are sorted
        assert dir_names == sorted(dir_names)
        # Verify actual directory paths
        assert all(
            "dir1" in name or "dir2" in name or "dir3" in name for name in dir_names
        )
