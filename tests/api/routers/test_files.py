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

        response = await api_client.get(f"/files?dir_path={temp_dir}&file_type=parquet")

        assert response.status_code == 200
        file_names = response.json()
        assert len(file_names) == 2
