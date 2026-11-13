from __future__ import annotations

from typing import TYPE_CHECKING, Literal
from pydantic import PrivateAttr, TypeAdapter

from toktagger.api.schemas.annotations import (
    AnnotationOut as AnnotationOutSchema,
    AnnotationTypes,
    TimePointOut as TimePointOutSchema,
    TimeRegionOut as TimeRegionOutSchema,
    BoundingBoxOut as BoundingBoxOutSchema,
    PolygonOut as PolygonOutSchema,
    VideoBoundingBoxOut as VideoBoundingBoxOutSchema,
    VideoPolygonOut as VideoPolygonOutSchema,
    VideoPointOut as VideoPointOutSchema,
    VideoFrameLabelOut as VideoFrameLabelOutSchema,
    ClassLabelOut as ClassLabelOutSchema,
    create_combined_model,
)
from toktagger.api.schemas.data import (
    DataParamTypes,
    DataParams,
    DataResponseType,
)
from toktagger.api.schemas.projects import Project as ProjectSchema, ProjectUpdate
from toktagger.api.schemas.samples import (
    Sample as SampleSchema,
    SampleIn,
    SampleSummary,
    SampleUpdate,
)
from toktagger.api.schemas.views import ViewParamTypes, ViewParams

from toktagger.client.exceptions import TokTaggerClientError

# Parse the heterogeneous data responses into their concrete types
if TYPE_CHECKING:
    from toktagger.client.client import TokTaggerClient


class Annotation(AnnotationOutSchema):
    """Annotation schema with a bound client for single-record updates."""

    _client: TokTaggerClient | None = PrivateAttr(default=None)

    def _require_client(self) -> TokTaggerClient:
        if self._client is None:
            raise TokTaggerClientError(
                "This Annotation has no client attached; retrieve it via "
                "TokTaggerClient.list_annotations() to use its methods."
            )
        return self._client

    def update(self, annotation: AnnotationTypes) -> AnnotationOutTypes:
        """Update this annotation without changing this local instance.

        Parameters
        ----------
        annotation : AnnotationTypes
            The label and geometry, plus optional fields to update. The type
            must match this annotation. Omitted optional fields and None
            values are left unchanged.

        Returns
        -------
        AnnotationOutTypes
            The updated concrete annotation, bound to the same client.

        Raises
        ------
        TokTaggerClientError
            If this Annotation has no client attached, or the server cannot
            be reached.
        TokTaggerAPIError
            If the API rejects the update, including missing annotations,
            insufficient permissions, or attempts to change annotation type.

        Notes
        -----
        IDs, authorship, shot ID and creation timestamp are preserved.
        Other annotations are untouched. Setting validated=True marks the
        sample validated; other updates leave its validation flag unchanged.
        A follow-up fetch returns the stored annotation. If that fetch fails,
        the update may already have been saved.
        """
        return self._require_client().update_annotation(
            self.project_id, self.sample_id, self.id, annotation
        )


# Generate Out classes using factory function
TimePointOut = create_combined_model(Annotation, TimePointOutSchema, "")
TimeRegionOut = create_combined_model(Annotation, TimeRegionOutSchema, "")
BoundingBoxOut = create_combined_model(Annotation, BoundingBoxOutSchema, "")
PolygonOut = create_combined_model(Annotation, PolygonOutSchema, "")
VideoBoundingBoxOut = create_combined_model(Annotation, VideoBoundingBoxOutSchema, "")
VideoPolygonOut = create_combined_model(Annotation, VideoPolygonOutSchema, "")
VideoPointOut = create_combined_model(Annotation, VideoPointOutSchema, "")
VideoFrameLabelOut = create_combined_model(Annotation, VideoFrameLabelOutSchema, "")
ClassLabelOut = create_combined_model(Annotation, ClassLabelOutSchema, "")

AnnotationOutTypes = (
    TimePointOut
    | TimeRegionOut
    | BoundingBoxOut
    | PolygonOut
    | VideoBoundingBoxOut
    | VideoPolygonOut
    | VideoPointOut
    | VideoFrameLabelOut
    | ClassLabelOut
)
AnnotationOutTypeAdapter = TypeAdapter(AnnotationOutTypes)


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

    def update(self, updates: ProjectUpdate) -> Project:
        """Return an updated project without changing this local instance."""
        return self._require_client().update_project(self.id, updates)

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

    def create_sample(self, sample: SampleIn) -> Sample:
        """Create a sample in this project and return it bound to the client."""
        return self._require_client().create_sample(self.id, sample)

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

    def update(self, updates: SampleUpdate) -> Sample:
        """Return an updated sample without changing this local instance."""
        return self._require_client().update_sample(self.project_id, self.id, updates)

    def create_annotations(self, annotations: list[AnnotationTypes]) -> list[str]:
        """Append new annotations to this sample without replacing existing ones.

        Parameters
        ----------
        annotations : list[AnnotationTypes]
            New annotations, such as TimeRegion or VideoBoundingBox.
            Shot, project and sample IDs are derived from this sample;
            supplied annotation IDs are ignored.

        Returns
        -------
        list[str]
            The new annotation IDs in input order, or an empty list if no
            annotations were supplied.

        Raises
        ------
        TokTaggerClientError
            If this Sample has no client attached, or the server cannot be
            reached.
        TokTaggerAPIError
            If the API returns a non-2xx response (e.g. 404 if the project or
            sample does not exist, or 403 if the caller cannot annotate it).

        Notes
        -----
        Requires project annotator/admin or global-admin access. Human
        annotations are attributed to the authenticated caller; registered
        machine authors are preserved. Any validated addition marks the sample
        validated; unvalidated additions do not clear its validation flag.
        Other samples are untouched, including those sharing the same shot ID.

        This local Sample is not refreshed or mutated. Use list_annotations()
        to retrieve saved records and fetch the sample again for its current
        validation flag. Creation is not transactional; check for saved
        annotations before retrying a failed request to avoid duplicates.
        """
        return self._require_client().create_annotations(
            self.project_id, self.id, annotations
        )

    def get_annotation(self, annotation_id: str) -> AnnotationOutTypes:
        """Get a single annotation belonging to this sample.

        Parameters
        ----------
        annotation_id : str
            The ID of the annotation to retrieve.

        Returns
        -------
        AnnotationOutTypes
            The concrete annotation, with resolved author information and
            this sample's client attached for chained updates.

        Raises
        ------
        TokTaggerClientError
            If this Sample has no client attached, or the server cannot
            be reached.
        TokTaggerAPIError
            If the API rejects the request, including 404 for an annotation
            not belonging to this sample or 403 for insufficient access.

        Notes
        -----
        Direct ID lookups ignore the annotation list preference.
        Project access is still required.
        """
        return self._require_client().get_annotation(
            self.project_id, self.id, annotation_id
        )

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
            start=start,
            count=count,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )
