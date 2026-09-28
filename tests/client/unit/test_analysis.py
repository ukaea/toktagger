import pandas as pd
import tests.db_definitions as db_definitions
from toktagger.client import analysis


def test_annotations_to_dataframe_mixed_types():
    df = analysis.annotations_to_dataframe(
        [db_definitions.ANNOTATION_1, db_definitions.ANNOTATION_3]
    )

    assert len(df) == 2
    # Common fields become columns, with the DB id under the name `id`
    expected_columns = {
        "id",
        "label",
        "type",
        "created_by",
        "validated",
        "project_id",
        "sample_id",
        "shot_id",
        "signal_name",
        "uncertainty",
        "timestamp",
        "time",
        "time_min",
        "time_max",
    }
    assert expected_columns == set(df.columns)
    assert df["type"].tolist() == ["time_region", "time_point"]
    # Type-specific fields are NaN for rows that lack them
    assert df.loc[0, "time_min"] == db_definitions.ANNOTATION_1.time_min
    assert pd.isna(df.loc[1, "time_min"])
    assert df.loc[1, "time"] == 0.1
    assert pd.isna(df.loc[0, "time"])


def test_annotations_to_dataframe_empty():
    df = analysis.annotations_to_dataframe([])
    assert df.empty
    assert len(df) == 0
