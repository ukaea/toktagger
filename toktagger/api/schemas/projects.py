from pydantic import Field, field_validator, computed_field, model_validator
from typing import Any, Optional, List
from enum import Enum

import yaml


from toktagger.api.core.data_loaders import LoaderRegistry
from toktagger.api.schemas import ConfiguredModel
from toktagger.api.schemas.layouts import DEFAULT_SOURCE, DataSource, Layout


class Task(str, Enum):
    """The type of labelling task for a project."""

    TIME_SERIES = "time-series"
    PROFILE_2D = "profile-2d"
    VIDEO = "video"
    RADIAL_PROFILE = "radial-profile"
    MULTI_PANEL = "multi-panel"


class QueryStrategyType(str, Enum):
    """The strategy to use when selecting the next sample to annotate."""

    RANDOM = "random"
    SEQUENTIAL = "sequential"
    UNCERTAINTY = "uncertainty"


class ProjectIn(ConfiguredModel):
    name: str = Field(..., description="The name of the project.")
    task: Task = Field(..., description="The type of labelling task.")
    query_strategy: QueryStrategyType = Field(
        ...,
        description="The strategy to use when selecting the next sample to annotate.",
    )

    data_loader: str = Field(
        ...,
        description="The type of data which will need to be loaded for this project.",
    )

    time_min: Optional[float] = Field(
        None,
        description="The minimum time (in seconds) for samples in this project.",
    )

    time_max: Optional[float] = Field(
        None,
        description="The maximum time (in seconds) for samples in this project.",
    )

    min_time_step: Optional[float] = Field(
        None,
        description="The minimum time step (in seconds) between samples in this project.",
    )

    shot_labels: Optional[List[str]] = Field(
        default=["Valid", "Invalid"],
        description="The list of labels to use for shot labelling (if applicable).",
    )

    time_region_labels: Optional[List[str]] = Field(
        default=[
            "ELM",
            "L-mode",
            "H-mode",
            "Thermal Quench",
            "Current Quench",
            "Sawtooth",
            "IRE",
            "Locked Mode",
            "VDE",
            "Flat Top",
            "Ramp Up",
            "Ramp Down",
            "NTM",
            "LLM",
            "Sawteeth",
            "Unknown",
        ],
        description="The list of labels to use for time region labelling (if applicable).",
    )

    time_point_labels: Optional[List[str]] = Field(
        default=[
            "Disruption",
            "Thermal Quench",
            "Current Quench",
            "Control Loss",
            "Locked Mode",
            "VDE",
        ],
        description="The list of labels to use for time point labelling (if applicable).",
    )

    bounding_box_labels: Optional[List[str]] = Field(
        default=["NTM", "LLM", "Sawteeth", "Locked Mode"],
        description="The list of labels to use for bounding box labelling (if applicable).",
    )

    polygon_labels: Optional[List[str]] = Field(
        default=["NTM", "LLM", "Sawteeth", "Locked Mode"],
        description="The list of labels to use for polygon labelling (if applicable).",
    )

    video_bounding_box_labels: Optional[List[str]] = Field(
        default=[
            "UFO",
            "Minor UFO",
            "Major UFO",
            "MARFE",
            "Other Anomaly",
        ],
        description="The list of labels to use for video bounding box labelling (if applicable).",
    )

    sources: list[DataSource] = Field(
        default_factory=list,
        description="The named data sources of this project. Leave empty to use one source with the project data loader.",
    )

    layout: Optional[Layout] = Field(
        None,
        description="The panels to show for each sample (required for multi-panel projects).",
    )

    layout_yaml: Optional[str] = Field(
        None,
        description="The sources and layout as YAML text. When set, it replaces the sources and the layout.",
    )

    @model_validator(mode="before")
    @classmethod
    def parse_layout_yaml(cls, data: Any) -> Any:
        if not isinstance(data, dict) or not data.get("layout_yaml"):
            return data
        try:
            config = yaml.safe_load(data["layout_yaml"])
        except yaml.YAMLError as error:
            raise ValueError(f"Invalid layout YAML: {error}") from error
        if not isinstance(config, dict) or "layout" not in config:
            raise ValueError("The layout YAML must have a 'layout' key.")
        return {
            **data,
            "sources": config.get("sources", []),
            "layout": config["layout"],
        }

    @computed_field
    @property
    def model_types(self) -> List[str]:
        from toktagger.api.models import models_dependencies_installed

        if not models_dependencies_installed():
            return []
        from toktagger.api.models.base import ModelRegistry

        return ModelRegistry.names(Task(self.task))

    @field_validator("data_loader")
    def check_data_loader(cls, value):
        if value not in (names := LoaderRegistry.names()):
            raise ValueError(
                f"Invalid data loader '{value}' - valid options are '{names}'."
            )

        return value

    @field_validator("sources")
    def check_sources(cls, sources: list[DataSource]) -> list[DataSource]:
        names = [source.name for source in sources]
        if len(set(names)) != len(names):
            raise ValueError(f"Data source names must be unique, but got '{names}'.")
        for source in sources:
            if source.data_loader not in (loaders := LoaderRegistry.names()):
                raise ValueError(
                    f"Invalid data loader '{source.data_loader}' for source '{source.name}' - valid options are '{loaders}'."
                )
        return sources

    @model_validator(mode="after")
    def check_layout(self):
        if not self.sources:
            self.sources = [
                DataSource(name=DEFAULT_SOURCE, data_loader=self.data_loader)
            ]
        if self.task == Task.MULTI_PANEL and self.layout is None:
            raise ValueError("A multi-panel project must have a layout.")
        if self.layout is not None:
            source_names = {source.name for source in self.sources}
            for panel in self.layout.panels:
                if panel.source not in source_names:
                    raise ValueError(
                        f"Panel '{panel.id}' uses unknown data source '{panel.source}' - valid options are '{sorted(source_names)}'."
                    )
        return self

    def get_source(self, name: str) -> DataSource | None:
        return next((source for source in self.sources if source.name == name), None)


class Project(ProjectIn):
    id: str = Field(..., alias="_id", description="The ID of this project.")
