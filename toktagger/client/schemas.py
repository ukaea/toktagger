from __future__ import annotations

from typing import TYPE_CHECKING, Literal
from pydantic import PrivateAttr

from toktagger.api.schemas.annotations import AnnotationOutTypes
from toktagger.api.schemas.data import (
    DataParamTypes,
    DataParams,
    DataResponseType,
)
from toktagger.api.schemas.projects import Project as ProjectSchema
from toktagger.api.schemas.samples import Sample as SampleSchema, SampleSummary
from toktagger.api.schemas.views import ViewParamTypes, ViewParams

from toktagger.client.exceptions import TokTaggerClientError

# Parse the heterogeneous data responses into their concrete types
if TYPE_CHECKING:
    from toktagger.client.client import TokTaggerClient


class Project(ProjectSchema):
    """Project schema object with a bound client reference.

    Allows chained lookup of samples within a project, eg:

    ```
    my_project: Project = client.get_project_by_name("My Project")

    # Contains all metadata about the project:
    my_project.task
        > "video"

    # Can be used to query samples:
    my_project.get_samples_summary()
        > SampleSummary(shot_min=1000, shot_max=2000, ...)

    sample = my_project.get_sample_by_shot_id(1000)
    ```
    """

    # Bootstrapped model: server Project schema plus a bound client reference
    _client: TokTaggerClient | None = PrivateAttr(default=None)

    def _require_client(self) -> TokTaggerClient:
        if self._client is None:
            raise TokTaggerClientError(
                "This Project has no client attached; it was not created by a "
                "TokTaggerClient. Create it via e.g. TokTaggerClient.get_project() "
                "to use its methods."
            )
        return self._client

    def list_samples(
        self,
        shot_id: int | None = None,
        start: int = 0,
        count: int = 100,
        sort_by: str = "_id",
        sort_direction: Literal["ascending", "descending"] = "descending",
    ) -> list[Sample]:
        """List this project's samples, most recent first by default.

        Parameters
        ----------
        shot_id : int, optional
            If provided, only return samples with this shot ID.
        start : int
            Number of matching samples to skip (pagination offset), by default 0
        count : int, default: 100
            Maximum number of samples to return, by default 100
        sort_by : str
            Field to sort the results by, by default '_id'
        sort_direction : Literal["ascending", "descending"]
            Sort order, by default 'descending'

        Returns
        -------
        list[Sample]
            The matching samples.

        Raises
        ------
        TokTaggerClientError
            If this Project has no client attached, or the server cannot be
            reached.
        TokTaggerAPIError
            If the API returns a non-2xx response.
        """
        return self._require_client().list_samples(
            self.id,
            shot_id=shot_id,
            start=start,
            count=count,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )

    def get_sample(self, sample_id: str) -> Sample:
        """Get a single sample in this project by its ID.

        Parameters
        ----------
        sample_id : str
            The ID of the sample to fetch.

        Returns
        -------
        Sample
            The requested sample.

        Raises
        ------
        TokTaggerClientError
            If this Project has no client attached, or the server cannot be
            reached.
        TokTaggerAPIError
            If the API returns a non-2xx response (e.g. 404 if the sample does
            not exist).
        """
        return self._require_client().get_sample(self.id, sample_id)

    def get_sample_by_shot_id(self, shot_id: int) -> Sample:
        """Get the sample in this project with the given shot ID.

        Parameters
        ----------
        shot_id : int
            The shot ID to look up.

        Returns
        -------
        Sample
            The sample with this shot ID.

        Raises
        ------
        NotFoundError
            If no sample in this project has this shot ID.
        MultipleResultsFoundError
            If more than one sample in this project has this shot ID.
        TokTaggerClientError
            If this Project has no client attached, or the server cannot be
            reached.
        TokTaggerAPIError
            If the underlying lookup returns a non-2xx response.
        """
        return self._require_client().get_sample_by_shot_id(self.id, shot_id)

    def get_samples_summary(self) -> SampleSummary:
        """Get the aggregated sample statistics for this project.

        Returns
        -------
        SampleSummary
            Aggregate statistics (counts by annotation type, etc.) over all of
            this project's samples.

        Raises
        ------
        TokTaggerClientError
            If this Project has no client attached, or the server cannot be
            reached.
        TokTaggerAPIError
            If the API returns a non-2xx response.
        """
        return self._require_client().get_samples_summary(self.id)

    def get_data(
        self,
        sample_id: str,
        params: DataParamTypes = DataParams(),
        view: ViewParamTypes = ViewParams(),
    ) -> DataResponseType:
        """Get data (e.g. a time trace) about one of this project's samples.

        Parameters
        ----------
        sample_id : str
            The ID of the sample to fetch data for.
        params : DataParams or ImageParams, default: DataParams()
            Data loader parameters (e.g. ``ImageParams(frame=...)`` for video
            data).
        view : ViewParams or Profile2DViewParams, default: ViewParams()
            View parameters controlling how the raw data is processed.

        Returns
        -------
        DataResponseType
            The sample data, parsed into its concrete type (e.g.
            ``TimeSeriesData``, ``ImageData``).

        Raises
        ------
        TokTaggerClientError
            If this Project has no client attached, or the server cannot be
            reached.
        TokTaggerAPIError
            If the API returns a non-2xx response (e.g. 404 if the sample or
            its data does not exist).

        Notes
        -----
        Use `to_processed()` on the `Data` object returned by this method to
        get the data into a format ready for analysis, eg a pandas Dataframe
        for time-series, an xarray Dataset for profile-2d, or a numpy Array for images.
        """
        return self._require_client().get_data(
            self.id, sample_id, params=params, view=view
        )

    def list_annotations(
        self,
        validated: bool | None = None,
        start: int = 0,
        count: int = 100,
        sort_by: str = "_id",
        sort_direction: Literal["ascending", "descending"] = "descending",
    ) -> list[AnnotationOutTypes]:
        """List annotations across all of this project's samples.

        Parameters
        ----------
        validated : bool, optional
            If provided, only return annotations with this validation status.
        start : int
            Number of matching annotations to skip (pagination offset), by default 0
        count : int, default: 100
            Maximum number of annotations to return, by default 100
        sort_by : str
            Field to sort the results by ('_id' is equivalent to timestamp),
            by default '_id'
        sort_direction : Literal["ascending", "descending"]
            Sort order, by default 'descending'

        Returns
        -------
        list[AnnotationOutTypes]
            The matching annotations, parsed into their concrete types
            (e.g. ``TimeRegion``, ``VideoBoundingBox``).

        Raises
        ------
        TokTaggerClientError
            If this Project has no client attached, or the server cannot be
            reached.
        TokTaggerAPIError
            If the API returns a non-2xx response (e.g. 404 if the project
            does not exist).
        """
        return self._require_client().list_annotations(
            self.id,
            validated=validated,
            start=start,
            count=count,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )


class Sample(SampleSchema):
    """Server Sample schema with a bound client reference.

    Allows chained retrieval of this sample's data and annotations, eg:

    ```
    sample: Sample = client.get_sample(project_id, sample_id)

    data = sample.get_data()
    annotations = sample.list_annotations(validated=True)
    ```
    """

    _client: TokTaggerClient | None = PrivateAttr(default=None)

    def _require_client(self) -> TokTaggerClient:
        if self._client is None:
            raise TokTaggerClientError(
                "This Sample has no client attached; it was not created by a "
                "TokTaggerClient. Create it via e.g. TokTaggerClient.get_sample() "
                "to use its methods."
            )
        return self._client

    def get_data(
        self,
        params: DataParamTypes = DataParams(),
        view: ViewParamTypes = ViewParams(),
    ) -> DataResponseType:
        """Get data (e.g. a time trace) about this sample.

        Parameters
        ----------
        params : DataParams or ImageParams, default: DataParams()
            Data loader parameters (e.g. ``ImageParams(frame=...)`` for video
            data).
        view : ViewParams or Profile2DViewParams, default: ViewParams()
            View parameters controlling how the raw data is processed.

        Returns
        -------
        DataResponseType
            The sample data, parsed into its concrete type (e.g.
            ``TimeSeriesData``, ``ImageData``).

        Raises
        ------
        TokTaggerClientError
            If this Sample has no client attached, or the server cannot be
            reached.
        TokTaggerAPIError
            If the API returns a non-2xx response (e.g. 404 if the sample or
            its data does not exist).

        Notes
        -----
        Use `to_processed()` on the `Data` object returned by this method to
        get the data into a format ready for analysis, eg a pandas Dataframe
        for time-series, an xarray Dataset for profile-2d, or a numpy Array for images.
        """
        return self._require_client().get_data(
            self.project_id, self.id, params=params, view=view
        )

    def list_annotations(
        self,
        validated: bool | None = None,
        created_by: str | None = None,
        start: int = 0,
        count: int = 100,
        sort_by: str = "_id",
        sort_direction: Literal["ascending", "descending"] = "descending",
    ) -> list[AnnotationOutTypes]:
        """List this sample's annotations.

        Parameters
        ----------
        validated : bool, optional
            If provided, only return annotations with this validation status.
        created_by : str, optional
            If provided, only return annotations created by this annotator
            (a model name or "manual").
        start : int
            Number of matching annotations to skip (pagination offset), by default 0
        count : int, default: 100
            Maximum number of annotations to return, by default 100
        sort_by : str
            Field to sort the results by ('_id' is equivalent to timestamp),
            by default '_id'
        sort_direction : Literal["ascending", "descending"]
            Sort order, by default 'descending'

        Returns
        -------
        list[AnnotationOutTypes]
            The matching annotations, parsed into their concrete types
            (e.g. ``TimeRegion``, ``VideoBoundingBox``).

        Raises
        ------
        TokTaggerClientError
            If this Sample has no client attached, or the server cannot be
            reached.
        TokTaggerAPIError
            If the API returns a non-2xx response (e.g. 404 if the project or
            sample does not exist).
        """
        return self._require_client().list_annotations(
            self.project_id,
            sample_id=self.id,
            validated=validated,
            created_by=created_by,
            start=start,
            count=count,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )
