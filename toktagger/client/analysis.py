"""Conversion helper for annotations fetched with the TokTagger client.

Pure conversion utility (no HTTP): it takes the Pydantic models returned by
`TokTaggerClient` and turns them into a pandas object for downstream
analysis. Sample data conversion lives on the data models themselves, as
`Data.to_processed()` in `toktagger.api.schemas.data`.
"""

import pandas as pd

from toktagger.api.schemas.annotations import AnnotationOutTypes


def annotations_to_dataframe(annotations: list[AnnotationOutTypes]) -> pd.DataFrame:
    """Convert fetched annotations into a single pandas DataFrame.

    Produces one row per annotation, with a column for every field present on
    any of the annotations. Fields that only exist on some annotation types
    (e.g. `time_min`/`time_max` on time regions but not time points) are
    NaN for the rows that lack them, so mixed annotation types can be
    aggregated together.

    Parameters
    ----------
    annotations : list of annotation models
        Annotations returned by e.g. `TokTaggerClient.list_annotations()`.

    Returns
    -------
    pandas.DataFrame
        One row per annotation. Columns include `id`, `label`, `type`,
        `created_by`, `validated`, `signal_name`, `uncertainty`,
        `project_id`, `sample_id`, `shot_id` and `timestamp`, plus
        type-specific fields such as `time`, `time_min`/`time_max`,
        `x_min`/`y_min` or `frame`/`track_id`. Empty input yields an
        empty DataFrame.

    Examples
    --------
    Aggregate a project's annotations (across all its samples) into one frame:

        from toktagger.client import annotations_to_dataframe

        df = annotations_to_dataframe(client.list_annotations(project_id))
    """
    # model_dump without by_alias so the frame carries `id`, not the DB's `_id`
    rows = [annotation.model_dump(mode="json") for annotation in annotations]
    return pd.DataFrame(rows)
