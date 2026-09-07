"""Stateless Python client for pulling TokTagger data for analysis.

See docs/dev/client-library.md for the full API specification.
"""

from __future__ import annotations

from typing import Any, Literal

import httpx

from pydantic import PrivateAttr, TypeAdapter

from toktagger.api.schemas.annotations import (
    AnnotationOutTypeAdapter,
    AnnotationOutTypes,
)
from toktagger.api.schemas.data import (
    DataParamTypes,
    DataParams,
    DataResponseType,
)
from toktagger.api.schemas.projects import Project as ProjectSchema
from toktagger.api.schemas.samples import Sample as SampleSchema, SampleSummary
from toktagger.api.schemas.views import ViewParamTypes, ViewParams

from toktagger.client.exceptions import (
    MultipleResultsFoundError,
    NotFoundError,
    TokTaggerAPIError,
    TokTaggerClientError,
)

# Parse the heterogeneous data responses into their concrete types
DataResponseTypeAdapter = TypeAdapter(DataResponseType)


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


class TokTaggerClient:
    """Stateless, synchronous client for the TokTagger API.

    Every method takes explicit project/sample IDs and returns Pydantic models
    parsed from the server response.

    Use it as a context manager so the underlying HTTP connection is closed on
    exit:

        with TokTaggerClient() as client:
            project = client.get_project_by_name("MST example")
            samples = client.list_samples(project.id, count=100)

    You can also chain together requests on the returned Project / Sample objects,
    without having to provide the ID:

        with TokTaggerClient() as client:
            project = client.get_project_by_name("MST example")
            samples = project.list_samples(count=100)


    Raises
    ------
    TokTaggerClientError
        Raised when the server cannot be reached, or when a bootstrapped model
        is used without an attached client.
    TokTaggerAPIError
        Raised when the API returns a non-2xx response. ``NotFoundError`` (a
        subclass) is raised on a 404 or a lookup that matched nothing.
    """

    def __init__(
        self,
        base_url: str = "http://localhost:8002",
        timeout: float = 30.0,
        headers: dict[str, str] | None = None,
        transport: httpx.BaseTransport | None = None,
    ):
        """Create a client for the TokTagger API.

        Parameters
        ----------
        base_url : str
            Base URL of the TokTagger server; a trailing slash is stripped, by default "http://localhost:8002"
        timeout : float
            Per-request HTTP timeout, in seconds, by default 30.0
        headers : dict of str, optional
            Extra HTTP headers to send with every request.
        transport : httpx.BaseTransport, optional
            A custom httpx transport. Intended as a test hook (e.g.
            `httpx.MockTransport`); leave unset for normal use.
        """
        # transport is a test hook, eg httpx.MockTransport
        self._base_url = base_url.rstrip("/")
        self._http = httpx.Client(
            base_url=self._base_url,
            timeout=timeout,
            headers=headers or {},
            transport=transport,
        )

    def __enter__(self) -> TokTaggerClient:
        """Return the client so it can be used in a `with` block."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Close the underlying HTTP connection, ignoring any in-flight error."""
        self._http.close()

    def health(self) -> dict[str, Any]:
        """Check that the server is running and its database is connected.

        Returns
        -------
        dict
            The parsed JSON body of `GET /health`.

        Raises
        ------
        TokTaggerClientError
            If the server cannot be reached.
        TokTaggerAPIError
            If the API returns a non-2xx response (e.g. 500 when the database
            is not connected).
        """
        return self._request("GET", "/health").json()

    def list_projects(
        self,
        name: str | None = None,
        start: int = 0,
        count: int = 100,
        sort_by: str = "_id",
        sort_direction: Literal["ascending", "descending"] = "descending",
    ) -> list[Project]:
        """List projects, most recent first by default.

        Parameters
        ----------
        name : str, optional
            If provided, only return projects whose name contains this value.
        start : int
            Number of matching projects to skip (pagination offset), by default: 0
        count : int
            Maximum number of projects to return, by default: 100
        sort_by : str
            Field to sort the results by, by default: "_id"
        sort_direction : Literal["ascending", "descending"]
            Sort order, by default "descending"

        Returns
        -------
        list[Project]
            The matching projects, each bootstrapped with this client so their
            methods can be called for further lookups.

        Raises
        ------
        TokTaggerClientError
            If the server cannot be reached.
        TokTaggerAPIError
            If the API returns a non-2xx response.

        Examples
        --------
        Fetch the first five projects:

            projects = client.list_projects(count=5)

        Fetch the next 5 projects:

            projects = client.list_projects(start=5, count=5)

        Fetch first ten projects with name containing "MAST", sorted alphabetically

            projects = client.list_projects(
                name="MAST",
                sort_by="name",
                sort_direction="descending"
            )
        """
        params = {
            "start": start,
            "count": count,
            "sort_by": sort_by,
            "sort_direction": sort_direction,
        }
        if name is not None:
            params["name"] = name

        data = self._request("GET", "/projects", params=params).json()
        return [self._bootstrap_project(project) for project in data]

    def get_project(self, project_id: str) -> Project:
        """Get a single project by its ID.

        Parameters
        ----------
        project_id : str
            The ID of the project to fetch.

        Returns
        -------
        Project
            The requested project, bootstrapped with this client.

        Raises
        ------
        TokTaggerClientError
            If the server cannot be reached.
        NotFoundError
            If no project with this ID exists (404).
        TokTaggerAPIError
            If the API returns another non-2xx response.
        """
        data = self._request("GET", f"/projects/{project_id}").json()
        return self._bootstrap_project(data)

    def get_project_by_name(self, name: str) -> Project:
        """Get a single project by its name.

        Parameters
        ----------
        name : str
            The name of the project to fetch; must match exactly one project.

        Returns
        -------
        Project
            The project with this name, bootstrapped with this client.

        Raises
        ------
        NotFoundError
            If no project has this name.
        MultipleResultsFoundError
            If more than one project has this name; use
            `list_projects(name=...)` to see all matches.
        TokTaggerClientError
            If the server cannot be reached.
        TokTaggerAPIError
            If the API returns a non-2xx response.
        """
        projects = self.list_projects(name=name)
        if len(projects) == 0:
            raise NotFoundError(None, f"No project found matching name '{name}'.")
        if len(projects) > 1:
            raise MultipleResultsFoundError(
                f"{len(projects)} projects matched name '{name}'; "
                f"use list_projects() to see all projects matching this name,"
                f"or use get_project() with a specific project ID."
            )
        return projects[0]

    def list_samples(
        self,
        project_id: str,
        shot_id: int | None = None,
        start: int = 0,
        count: int = 100,
        sort_by: str = "_id",
        sort_direction: Literal["ascending", "descending"] = "descending",
    ) -> list[Sample]:
        """List the samples in a project, most recent first by default.

        Parameters
        ----------
        project_id : str
            The ID of the project whose samples to list.
        shot_id : int, optional
            If provided, only return samples with this shot ID.
        start : int, default: 0
            Number of matching samples to skip (pagination offset).
        count : int, default: 100
            Maximum number of samples to return.
        sort_by : str, default: ``"_id"``
            Field to sort the results by.
        sort_direction : {"ascending", "descending"}, default: ``"descending"``
            Sort order.

        Returns
        -------
        list[Sample]
            The matching samples, each bootstrapped with this client.

        Raises
        ------
        TokTaggerClientError
            If the server cannot be reached.
        TokTaggerAPIError
            If the API returns a non-2xx response (e.g. 404 if the project does
            not exist).
        """
        params = {
            "start": start,
            "count": count,
            "sort_by": sort_by,
            "sort_direction": sort_direction,
        }
        if shot_id is not None:
            params["shot_id"] = shot_id
        data = self._request(
            "GET", f"/projects/{project_id}/samples", params=params
        ).json()
        return [self._bootstrap_sample(sample) for sample in data]

    def get_sample(self, project_id: str, sample_id: str) -> Sample:
        """Get a single sample by project and sample ID.

        Parameters
        ----------
        project_id : str
            The ID of the project the sample belongs to.
        sample_id : str
            The ID of the sample to fetch.

        Returns
        -------
        Sample
            The requested sample, bootstrapped with this client.

        Raises
        ------
        TokTaggerClientError
            If the server cannot be reached.
        NotFoundError
            If no sample with this ID exists in the project (404).
        TokTaggerAPIError
            If the API returns another non-2xx response.
        """
        data = self._request(
            "GET", f"/projects/{project_id}/samples/{sample_id}"
        ).json()
        return self._bootstrap_sample(data)

    def get_sample_by_shot_id(self, project_id: str, shot_id: int) -> Sample:
        """Get the sample in a project with the given shot ID.

        Parameters
        ----------
        project_id : str
            The ID of the project to search.
        shot_id : int
            The shot ID to look up.

        Returns
        -------
        Sample
            The sample with this shot ID, bootstrapped with this client.

        Raises
        ------
        NotFoundError
            If no sample in the project has this shot ID.
        MultipleResultsFoundError
            If more than one sample in the project has this shot ID; use
            ``list_samples(project_id, shot_id=...)`` to see all matches.
        TokTaggerClientError
            If the server cannot be reached.
        TokTaggerAPIError
            If the API returns a non-2xx response.
        """
        samples = self.list_samples(project_id, shot_id=shot_id)
        if len(samples) == 0:
            raise NotFoundError(
                None,
                f"No sample found with shot ID {shot_id} in project {project_id}.",
            )
        if len(samples) > 1:
            raise MultipleResultsFoundError(
                f"{len(samples)} samples matched shot ID {shot_id} in project "
                f"{project_id}; use list_samples() to see all samples matching this shot ID,"
                f"or use get_sample() with a specific sample ID."
            )
        return samples[0]

    def get_samples_summary(self, project_id: str) -> SampleSummary:
        """Get the aggregated sample statistics for a project.

        Parameters
        ----------
        project_id : str
            The ID of the project to summarise.

        Returns
        -------
        SampleSummary
            Aggregate statistics (counts by annotation type, etc.) over all of
            the project's samples.

        Raises
        ------
        TokTaggerClientError
            If the server cannot be reached.
        TokTaggerAPIError
            If the API returns a non-2xx response.
        """
        data = self._request("GET", f"/projects/{project_id}/samples/summary").json()
        return SampleSummary.model_validate(data)

    def get_data(
        self,
        project_id: str,
        sample_id: str,
        params: DataParamTypes = DataParams(),
        view: ViewParamTypes = ViewParams(),
    ) -> DataResponseType:
        """Get data (e.g. a time trace or image) about a sample.

        Parameters
        ----------
        project_id : str
            The ID of the project the sample belongs to.
        sample_id : str
            The ID of the sample to fetch data for.
        params : DataParams or ImageParams, default: DataParams()
            Data loader parameters (e.g. ``ImageParams(frame=...)`` to fetch a
            single frame from video data).
        view : ViewParams or Profile2DViewParams, default: ViewParams()
            View parameters controlling how the raw data is processed.

        Returns
        -------
        DataResponseType
            The sample data, parsed into its concrete type (e.g.
            ``MultiVariateTimeSeriesData``, ``ImageData``).

        Raises
        ------
        TokTaggerClientError
            If the server cannot be reached.
        NotFoundError
            If the project or sample does not exist, or the underlying data
            cannot be found (404).
        TokTaggerAPIError
            If the API returns another non-2xx response (e.g. 400 for an
            invalid view).
        """
        body = {
            "params": params.model_dump(mode="json"),
            "view": view.model_dump(mode="json"),
        }
        data = self._request(
            "POST", f"/projects/{project_id}/samples/{sample_id}/data", json=body
        ).json()
        return DataResponseTypeAdapter.validate_python(data)

    def list_annotations(
        self,
        project_id: str,
        sample_id: str | None = None,
        validated: bool | None = None,
        created_by: str | None = None,
        start: int = 0,
        count: int = 100,
        sort_by: str = "_id",
        sort_direction: Literal["ascending", "descending"] = "descending",
    ) -> list[AnnotationOutTypes]:
        """List annotations for a project or a single sample in it.

        Parameters
        ----------
        project_id : str
            The ID of the project to list annotations for.
        sample_id : str, optional
            If provided, only return annotations for this sample, which also
            enables the ``created_by`` filter.
        validated : bool, optional
            If provided, only return annotations with this validation status.
        created_by : str, optional
            If provided, only return annotations created by this annotator
            (a model name or "manual"); requires ``sample_id``.
        start : int, default: 0
            Number of matching annotations to skip (pagination offset).
        count : int, default: 100
            Maximum number of annotations to return.
        sort_by : str, default: ``"_id"``
            Field to sort the results by (``"_id"`` is equivalent to timestamp).
        sort_direction : {"ascending", "descending"}, default: ``"descending"``
            Sort order.

        Returns
        -------
        list[AnnotationOutTypes]
            The matching annotations, parsed into their concrete types
            (e.g. ``TimeRegion``, ``VideoBoundingBox``).

        Raises
        ------
        TokTaggerClientError
            If the server cannot be reached, or if ``created_by`` is given
            without a ``sample_id``.
        TokTaggerAPIError
            If the API returns a non-2xx response (e.g. 404 if the project or
            sample does not exist).
        """
        if created_by is not None and sample_id is None:
            raise TokTaggerClientError(
                "The created_by filter is only supported at sample level; "
                "pass sample_id to filter annotations by created_by."
            )

        params = {
            "start": start,
            "count": count,
            "sort_by": sort_by,
            "sort_direction": sort_direction,
        }
        if validated is not None:
            params["validated"] = validated
        if created_by is not None:
            params["created_by"] = created_by

        if sample_id is not None:
            path = f"/projects/{project_id}/samples/{sample_id}/annotations"
        else:
            path = f"/projects/{project_id}/annotations"
        data = self._request("GET", path, params=params).json()
        # Parse each annotation once so callers get concrete typed objects
        return [AnnotationOutTypeAdapter.validate_python(a) for a in data]

    def _request(
        self,
        method: str,
        path: str,
        params: dict[str, object] | None = None,
        json: dict | list | None = None,
    ) -> httpx.Response:
        try:
            response = self._http.request(method, path, params=params, json=json)
        except httpx.HTTPError as e:
            raise TokTaggerClientError(
                f"Failed to reach TokTagger server at {self._base_url}: {e}"
            ) from e

        if response.status_code >= 400:
            detail = self._extract_detail(response)
            if response.status_code == 404:
                raise NotFoundError(response.status_code, detail)
            raise TokTaggerAPIError(response.status_code, detail)
        return response

    @staticmethod
    def _extract_detail(response: httpx.Response) -> str:
        try:
            body = response.json()
        except ValueError:
            return response.text
        detail = body.get("detail") if isinstance(body, dict) else body
        return detail if isinstance(detail, str) else str(detail)

    def _bootstrap_project(self, data: dict[str, Any]) -> Project:
        # Attach this client so the returned model can be used for chained calls
        project = Project.model_validate(data)
        project._client = self
        return project

    def _bootstrap_sample(self, data: dict[str, Any]) -> Sample:
        sample = Sample.model_validate(data)
        sample._client = self
        return sample
