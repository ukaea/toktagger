from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, model_validator

from toktagger.api.schemas.views import (
    Profile2DViewParams,
    RadialProfileViewParams,
    ViewParams,
    ViewParamTypes,
)

DEFAULT_SOURCE = "default"


class DataSource(BaseModel):
    """A named data source of a project, loaded with one data loader."""

    name: str = Field(..., min_length=1, description="The name of this data source.")
    data_loader: str = Field(
        ..., description="The data loader that reads this data source."
    )


class GridPlacement(BaseModel):
    col: int = Field(1, ge=1, description="The first grid column of the panel.")
    row: int = Field(1, ge=1, description="The first grid row of the panel.")
    col_span: int = Field(1, ge=1, description="The number of grid columns.")
    row_span: int = Field(1, ge=1, description="The number of grid rows.")


class PanelBase(BaseModel):
    id: str = Field(..., min_length=1, description="The unique ID of this panel.")
    title: str | None = Field(None, description="The title to show on this panel.")
    source: str = Field(
        DEFAULT_SOURCE, description="The project data source that this panel reads."
    )
    grid: GridPlacement = Field(default_factory=GridPlacement)

    def signal_names(self) -> list[str]:
        return []

    def default_view(self) -> ViewParamTypes:
        return ViewParams()


class TimeSeriesPanel(PanelBase):
    kind: Literal["time_series"] = "time_series"
    signals: list[str] = Field(..., min_length=1)

    def signal_names(self) -> list[str]:
        return self.signals


class Profile2DPanel(PanelBase):
    kind: Literal["profile_2d"] = "profile_2d"
    signal: str

    def signal_names(self) -> list[str]:
        return [self.signal]

    def default_view(self) -> ViewParamTypes:
        return Profile2DViewParams(signal_name=self.signal)


class RadialProfilePanel(PanelBase):
    kind: Literal["radial_profile"] = "radial_profile"
    profile_signals: list[str] = Field(..., min_length=1)
    time_series_signals: list[str] = Field(default_factory=list)

    def signal_names(self) -> list[str]:
        return [*self.profile_signals, *self.time_series_signals]

    def default_view(self) -> ViewParamTypes:
        return RadialProfileViewParams()


class VideoPanel(PanelBase):
    kind: Literal["video"] = "video"
    signal: str | None = None

    def signal_names(self) -> list[str]:
        return [self.signal] if self.signal else []


PanelTypes = Annotated[
    TimeSeriesPanel | Profile2DPanel | RadialProfilePanel | VideoPanel,
    Field(discriminator="kind"),
]


DEFAULT_TAB_TITLE = "Main"


def _duplicates(values: list[str]) -> list[str]:
    return sorted({value for value in values if values.count(value) > 1})


class LayoutTab(BaseModel):
    """A named page of panels, shown on its own grid."""

    title: str = Field(..., min_length=1, description="The title of this tab.")
    panels: list[PanelTypes] = Field(..., min_length=1)


class Layout(BaseModel):
    tabs: list[LayoutTab] = Field(..., min_length=1)
    link_time: bool = Field(
        True, description="Keep the time axis of all panels the same."
    )

    @model_validator(mode="before")
    @classmethod
    def panels_to_tabs(cls, data: Any) -> Any:
        if isinstance(data, dict) and "tabs" not in data and "panels" in data:
            panels = data["panels"]
            data = {key: value for key, value in data.items() if key != "panels"}
            data["tabs"] = [{"title": DEFAULT_TAB_TITLE, "panels": panels}]
        return data

    @model_validator(mode="after")
    def check_unique_names(self) -> "Layout":
        if duplicates := _duplicates([panel.id for panel in self.panels]):
            raise ValueError(f"Panel IDs must be unique, duplicates: {duplicates}")
        if duplicates := _duplicates([tab.title for tab in self.tabs]):
            raise ValueError(f"Tab titles must be unique, duplicates: {duplicates}")
        return self

    @property
    def panels(self) -> list[PanelTypes]:
        return [panel for tab in self.tabs for panel in tab.panels]

    def get_panel(self, panel_id: str) -> PanelTypes | None:
        return next((panel for panel in self.panels if panel.id == panel_id), None)
