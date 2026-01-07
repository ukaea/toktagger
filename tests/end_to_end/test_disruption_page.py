from playwright.sync_api import Page, expect
import pathlib
from tests.endpoints import (
    create_project,
    create_local_samples,
)
import pytest
import requests
import time
from toktagger.api.schemas.annotations import TimePoint, TimeRegion


@pytest.mark.parametrize("zone_type", ["RampUp", "FlatTop", "RampDown"])
def test_disruption_add_zone(zone_type, server_setup, page: Page):
    # Create Project
    project_id = create_project("Test Project", "disruption", "parquet")
    # And a sample for disruption
    ids = create_local_samples(
        project_id, [10000], pathlib.Path(__file__).parents[1], ["Ip"]
    )

    sample_id = ids[0]

    # Navigate to page
    page.goto(f"http://localhost:8002/ui/projects/{project_id}/samples/{sample_id}")

    # Check time series plot rendered
    expect(page.get_by_label("time-series")).to_be_visible()

    # Right click on it, check menu renders
    page.get_by_label("time-series").click(button="right")

    expect(page.get_by_role("menuitem", name="Add zone")).to_be_visible()
    expect(page.get_by_role("menuitem", name="Add Disruption")).to_be_visible()

    # Choose add zone, check options load
    page.get_by_role("menuitem", name="Add zone").click()
    expect(page.get_by_role("menuitem", name="RampUp", exact=True)).to_be_visible()
    expect(page.get_by_role("menuitem", name="FlatTop", exact=True)).to_be_visible()
    expect(page.get_by_role("menuitem", name="RampDown", exact=True)).to_be_visible()

    # Choose each type, check a new zone is added
    page.get_by_role("menuitem", name=zone_type, exact=True).click()
    expect(page.get_by_label("zone").first).to_be_visible()

    # Check added to list
    expect(page.get_by_role("rowheader", name=zone_type)).to_be_visible()

    # Check you can right click to delete it
    page.get_by_label("zone").first.click(button="right")
    expect(page.get_by_role("menuitem", name="Delete")).to_be_visible()
    page.get_by_role("menuitem", name="Delete").click(force=True)

    # Check it no longer exists
    expect(page.get_by_label("zone").first).to_be_hidden()
    expect(page.get_by_role("rowheader", name=zone_type)).to_be_hidden()


@pytest.mark.parametrize("zone_type", ["RampUp", "FlatTop", "RampDown"])
@pytest.mark.parametrize("handle", ["leftHandle", "rightHandle"])
@pytest.mark.parametrize("drag_to", [".wdrag", ".edrag"])
def test_disruption_drag_zone(zone_type, handle, drag_to, server_setup, page: Page):
    # Create Project
    project_id = create_project("Test Project", "disruption", "parquet")
    # And a sample for disruption
    ids = create_local_samples(
        project_id, [10000], pathlib.Path(__file__).parents[1], ["Ip"]
    )

    sample_id = ids[0]

    # Navigate to page
    page.goto(f"http://localhost:8002/ui/projects/{project_id}/samples/{sample_id}")

    # Check time series plot rendered
    expect(page.get_by_label("time-series")).to_be_visible()

    # Add a new zone
    page.get_by_label("time-series").click(button="right")
    page.get_by_role("menuitem", name="Add zone").click()

    # Choose each type, check a new zone is added
    page.get_by_role("menuitem", name=zone_type, exact=True).click()
    expect(page.get_by_label("zone").first).to_be_visible()

    # Check added to list, record initial positions
    expect(page.get_by_role("rowheader", name=zone_type)).to_be_visible()
    initial_left_position = float(
        page.get_by_role("row").nth(1).get_by_role("cell").nth(0).inner_text()
    )
    initial_right_position = float(
        page.get_by_role("row").nth(1).get_by_role("cell").nth(1).inner_text()
    )

    # Click handle, drag to new position
    page.get_by_label(f"zone.{handle}").drag_to(page.locator(drag_to))
    time.sleep(0.1)
    # Check values in table correctly updated
    updated_left_position = float(
        page.get_by_role("row").nth(1).get_by_role("cell").nth(0).inner_text()
    )
    updated_right_position = float(
        page.get_by_role("row").nth(1).get_by_role("cell").nth(1).inner_text()
    )

    if drag_to == ".wdrag":
        # Dragging left, left position should have reduced
        assert updated_left_position < initial_left_position

        if handle == "leftHandle":
            # If left handle dragged, right position should be unchanged
            assert updated_right_position == initial_right_position
        else:
            # If right handle dragged, positions should 'swap', so right position should be where left position was previously
            assert updated_right_position == initial_left_position
    else:
        # Dragging right, right position should be the increased
        assert updated_right_position > initial_right_position

        if handle == "leftHandle":
            # If left handle dragged, positions should 'swap', so left position should be where right position was previously
            assert updated_left_position == initial_right_position
        else:
            # If right handle dragged, left position should be unchanged
            assert updated_left_position == initial_left_position


def test_disruption_add_vspan(server_setup, page: Page):
    # Create Project
    project_id = create_project("Test Project", "disruption", "parquet")
    # And a sample for disruption
    ids = create_local_samples(
        project_id, [10000], pathlib.Path(__file__).parents[1], ["Ip"]
    )

    sample_id = ids[0]

    # Navigate to page
    page.goto(f"http://localhost:8002/ui/projects/{project_id}/samples/{sample_id}")

    # Check time series plot rendered
    expect(page.get_by_label("time-series")).to_be_visible()

    # Right click on it, check menu renders
    page.get_by_label("time-series").click(button="right")

    expect(page.get_by_role("menuitem", name="Add zone")).to_be_visible()
    expect(page.get_by_role("menuitem", name="Add Disruption")).to_be_visible()

    # Choose add disruption
    page.get_by_role("menuitem", name="Add Disruption").click()

    # Check disruption Vspan has been added
    expect(page.get_by_label("vspan").first).to_be_visible()

    # Check added to list
    expect(page.get_by_role("rowheader", name="Disruption")).to_be_visible()

    # Check you can right click to delete it
    page.get_by_label("vspan").first.click(button="right")
    expect(page.get_by_role("menuitem", name="Delete")).to_be_visible()
    page.get_by_role("menuitem", name="Delete").click(force=True)

    # Check it no longer exists
    expect(page.get_by_label("vspan").first).to_be_hidden()
    expect(page.get_by_role("rowheader", name="Disruption")).to_be_hidden()


@pytest.mark.parametrize("drag_to", [".wdrag", ".edrag"])
def test_disruption_drag_vspan(drag_to, server_setup, page: Page):
    # Create Project
    project_id = create_project("Test Project", "disruption", "parquet")
    # And a sample for disruption
    ids = create_local_samples(
        project_id, [10000], pathlib.Path(__file__).parents[1], ["Ip"]
    )

    sample_id = ids[0]

    # Navigate to page
    page.goto(f"http://localhost:8002/ui/projects/{project_id}/samples/{sample_id}")

    # Check time series plot rendered
    expect(page.get_by_label("time-series")).to_be_visible()

    # Add a new vspan
    page.get_by_label("time-series").click(button="right")
    page.get_by_role("menuitem", name="Add Disruption").click()

    expect(page.get_by_label("vspan").first).to_be_visible()

    # Check added to list, record initial positions
    expect(page.get_by_role("rowheader", name="Disruption")).to_be_visible()
    initial_position = float(
        page.get_by_role("row").nth(1).get_by_role("cell").nth(0).inner_text()
    )

    # Click handle, drag to new position
    page.get_by_label("vspan").drag_to(page.locator(drag_to))
    time.sleep(0.1)

    # Check values in table correctly updated
    updated_position = float(
        page.get_by_role("row").nth(1).get_by_role("cell").nth(0).inner_text()
    )

    if drag_to == ".wdrag":
        # Dragging left, position should have reduced
        assert updated_position < initial_position
    else:
        # Dragging right, position should be increased
        assert updated_position > initial_position


def test_disruption_save_annotations(server_setup, page: Page):
    # Create Project
    project_id = create_project("Test Project", "disruption", "parquet")
    # And a sample for disruption
    ids = create_local_samples(
        project_id, [10000], pathlib.Path(__file__).parents[1], ["Ip"]
    )

    sample_id = ids[0]

    # Navigate to page
    page.goto(f"http://localhost:8002/ui/projects/{project_id}/samples/{sample_id}")

    # Check time series plot rendered
    expect(page.get_by_label("time-series")).to_be_visible()

    # Add a new vspan
    page.get_by_label("time-series").click(button="right")
    page.get_by_role("menuitem", name="Add Disruption").click()

    expect(page.get_by_label("vspan").first).to_be_visible()

    # Drag to new position on right
    page.get_by_label("vspan").drag_to(page.locator(".edrag"))

    # Get value of position
    disruption_position = (
        page.get_by_role("row").nth(1).get_by_role("cell").nth(0).inner_text()
    )

    # Add a zone
    page.get_by_label("time-series").click(button="right")
    page.get_by_role("menuitem", name="Add zone").click()
    page.get_by_role("menuitem", name="FlatTop", exact=True).click()
    expect(page.get_by_label("zone").first).to_be_visible()

    # Click handle, drag to new position
    page.get_by_label("zone.leftHandle").drag_to(page.locator(".wdrag"))

    # Check added to list, record positions
    expect(page.get_by_role("rowheader", name="FlatTop")).to_be_visible()
    flattop_left_position = (
        page.get_by_role("row").nth(1).get_by_role("cell").nth(0).inner_text()
    )
    flattop_right_position = (
        page.get_by_role("row").nth(1).get_by_role("cell").nth(1).inner_text()
    )

    # Press Save
    page.get_by_role("button", name="Save").click()

    time.sleep(1)

    # Check annotation stored in db
    response = requests.get(
        f"http://localhost:8002/projects/{project_id}/samples/{sample_id}/annotations"
    )
    assert response.status_code == 200
    annotations = response.json()

    assert len(annotations) == 2

    for annotation in annotations:
        assert annotation["created_by"] == "manual"
        assert annotation["validated"]  # == True
        assert annotation["uncertainty"] == 0

    disruption_annotation = next(
        ann for ann in annotations if ann["label"] == "Disruption"
    )
    assert round(disruption_annotation["time"], 6) == float(disruption_position)
    assert disruption_annotation["type"] == "time_point"

    flattop_annotation = next(ann for ann in annotations if ann["label"] == "FlatTop")
    assert round(flattop_annotation["time_min"], 6) == float(flattop_left_position)
    assert round(flattop_annotation["time_max"], 6) == float(flattop_right_position)
    assert flattop_annotation["type"] == "time_region"


def test_disruption_load_annotations(server_setup, page: Page):
    # Create Project
    project_id = create_project("Test Project", "disruption", "parquet")
    # And a sample for disruption
    ids = create_local_samples(
        project_id, [10000], pathlib.Path(__file__).parents[1], ["Ip"]
    )

    sample_id = ids[0]

    # Create annotations of each type
    rampup = TimeRegion(
        label="RampUp", created_by="peak_detection", time_min=10, time_max=20
    )
    flattop = TimeRegion(
        label="FlatTop", created_by="peak_detection", time_min=20, time_max=70
    )
    rampdown = TimeRegion(
        label="RampDown", created_by="peak_detection", time_min=70, time_max=90
    )
    disruption = TimePoint(label="Disruption", created_by="peak_detection", time=91)
    # Add annotations
    response = requests.put(
        f"http://localhost:8002/projects/{project_id}/samples/{sample_id}/annotations",
        json=[
            model.model_dump(mode="json")
            for model in (rampup, flattop, rampdown, disruption)
        ],
    )
    assert response.status_code == 200

    # Navigate to page
    page.goto(f"http://localhost:8002/ui/projects/{project_id}/samples/{sample_id}")

    # One vspan and 3 zones visible
    expect(page.get_by_label("vspan").first).to_be_visible()
    assert page.get_by_label("zone", exact=True).count() == 3

    # Check all four entries have correct info in table
    row = page.get_by_role("row").filter(
        has=page.get_by_role("rowheader", name="Disruption")
    )
    assert float(row.get_by_role("cell").nth(0).inner_text()) == disruption.time

    row = page.get_by_role("row").filter(
        has=page.get_by_role("rowheader", name="RampUp")
    )
    assert float(row.get_by_role("cell").nth(0).inner_text()) == rampup.time_min
    assert float(row.get_by_role("cell").nth(1).inner_text()) == rampup.time_max

    row = page.get_by_role("row").filter(
        has=page.get_by_role("rowheader", name="FlatTop")
    )
    assert float(row.get_by_role("cell").nth(0).inner_text()) == flattop.time_min
    assert float(row.get_by_role("cell").nth(1).inner_text()) == flattop.time_max

    row = page.get_by_role("row").filter(
        has=page.get_by_role("rowheader", name="RampDown")
    )
    assert float(row.get_by_role("cell").nth(0).inner_text()) == rampdown.time_min
    assert float(row.get_by_role("cell").nth(1).inner_text()) == rampdown.time_max


def test_disruption_update_annotations(server_setup, page: Page):
    # Create Project
    project_id = create_project("Test Project", "disruption", "parquet")
    # And a sample for disruption
    ids = create_local_samples(
        project_id, [10000], pathlib.Path(__file__).parents[1], ["Ip"]
    )

    sample_id = ids[0]

    # Create annotations of each type
    rampup = TimeRegion(
        label="RampUp", created_by="peak_detection", time_min=10, time_max=20
    )
    flattop = TimeRegion(
        label="FlatTop", created_by="peak_detection", time_min=20, time_max=70
    )
    disruption = TimePoint(label="Disruption", created_by="peak_detection", time=71)
    # Add annotations
    response = requests.put(
        f"http://localhost:8002/projects/{project_id}/samples/{sample_id}/annotations",
        json=[model.model_dump(mode="json") for model in (rampup, flattop, disruption)],
    )
    assert response.status_code == 200

    # Navigate to page
    page.goto(f"http://localhost:8002/ui/projects/{project_id}/samples/{sample_id}")

    # One vspan and 3 zones visible
    expect(page.get_by_label("vspan").first).to_be_visible()
    assert page.get_by_label("zone", exact=True).count() == 2

    # Delete a zone
    page.get_by_label("zone").first.click(button="right")
    expect(page.get_by_role("menuitem", name="Delete")).to_be_visible()
    page.get_by_role("menuitem", name="Delete").click()

    # Move the disruption
    # Click handle, drag to new position
    page.get_by_label("vspan").drag_to(page.locator(".edrag"))

    row = page.get_by_role("row").filter(
        has=page.get_by_role("rowheader", name="Disruption")
    )
    updated_disruption_time = float(row.get_by_role("cell").nth(0).inner_text())

    # Press Save
    page.get_by_role("button", name="Save").click()

    time.sleep(1)

    # Check annotation stored in db
    response = requests.get(
        f"http://localhost:8002/projects/{project_id}/samples/{sample_id}/annotations"
    )
    assert response.status_code == 200
    annotations = response.json()

    # Check one annotation removed
    assert len(annotations) == 2
    print(annotations)

    # Check all annotations marked as validated
    for annotation in annotations:
        assert annotation["validated"]  # == True
        assert annotation["uncertainty"] == 0

    # Check time of disruption updated
    disruption_annotation = next(
        ann for ann in annotations if ann["label"] == "Disruption"
    )
    assert round(disruption_annotation["time"], 6) == updated_disruption_time
