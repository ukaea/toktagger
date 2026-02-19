from playwright.sync_api import Page, expect
import pathlib
from tests.endpoints import create_project, create_local_samples, create_model_samples
import pytest
import requests
import time
from toktagger.api.schemas.annotations import TimePoint, TimeRegion


@pytest.mark.parametrize("zone_type", ["Ramp Up", "Flat Top", "Ramp Down"])
def test_timeseries_add_zone(zone_type, server_setup, page: Page):
    # Create Project
    project_id = create_project("Test Project", "time-series", "parquet")
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

    expect(page.get_by_role("menuitem", name="Add Time Region")).to_be_visible()
    expect(page.get_by_role("menuitem", name="Add Time Point")).to_be_visible()

    visible_menu = page.locator('[data-testid="zone-submenu"]')
    expect(visible_menu).to_be_visible()

    # Choose Add Time Region, check options load
    visible_menu.click(force=True)
    for item in (
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
    ):
        expect(
            visible_menu.get_by_role("menuitem", name=item, exact=True)
        ).to_be_visible()

    # Choose each type, check a new zone is added
    visible_menu.get_by_role("menuitem", name=zone_type, exact=True).click(force=True)
    expect(page.get_by_label("zone").first).to_be_visible()

    # Check added to list
    expect(page.get_by_role("rowheader", name=zone_type)).to_be_visible()

    # Wait for a bit for Zone to fully render
    page.wait_for_timeout(200)

    # Check you can right click to delete it
    page.get_by_label("zone").first.click(button="right")
    expect(page.get_by_role("menuitem", name="Delete")).to_be_visible()
    page.get_by_role("menuitem", name="Delete").click(force=True)

    # Wait for a bit for Zone to fully delete
    page.wait_for_timeout(200)

    # Check it no longer exists
    expect(page.get_by_role("rowheader", name=zone_type, exact=True)).to_have_count(0)
    expect(page.get_by_label("zone").first).to_have_count(0)


@pytest.mark.parametrize("zone_type", ["Ramp Up", "Flat Top", "Ramp Down"])
@pytest.mark.parametrize("handle", ["leftHandle", "rightHandle"])
@pytest.mark.parametrize("drag_to", [".wdrag", ".edrag"])
def test_timeseries_drag_zone(zone_type, handle, drag_to, server_setup, page: Page):
    # Create Project
    project_id = create_project("Test Project", "time-series", "parquet")
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

    expect(page.get_by_role("menuitem", name="Add Time Region")).to_be_visible()
    expect(page.get_by_role("menuitem", name="Add Time Point")).to_be_visible()

    # Add a new zone
    page.get_by_role("menuitem", name="Add Time Region").click(force=True)

    # Choose each type, check a new zone is added
    page.get_by_role("menuitem", name=zone_type, exact=True).click(force=True)
    expect(page.get_by_label("zone").first).to_be_visible()

    # Check added to list, record initial positions
    expect(page.get_by_role("rowheader", name=zone_type)).to_be_visible()
    initial_left_position = float(
        page.get_by_role("row").nth(1).get_by_role("gridcell").nth(1).inner_text()
    )
    initial_right_position = float(
        page.get_by_role("row").nth(1).get_by_role("gridcell").nth(2).inner_text()
    )

    # Click handle, drag to new position
    page.get_by_label(f"zone.{handle}").drag_to(page.locator(drag_to))
    time.sleep(0.1)
    # Check values in table correctly updated
    updated_left_position = float(
        page.get_by_role("row").nth(1).get_by_role("gridcell").nth(1).inner_text()
    )
    updated_right_position = float(
        page.get_by_role("row").nth(1).get_by_role("gridcell").nth(2).inner_text()
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


@pytest.mark.parametrize(
    "zone_type", ["Disruption", "Thermal Quench", "Current Quench", "Control Loss"]
)
def test_timeseries_add_vspan(server_setup, page: Page, zone_type: str):
    # Create Project
    project_id = create_project("Test Project", "time-series", "parquet")
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

    expect(page.get_by_role("menuitem", name="Add Time Region")).to_be_visible()
    expect(page.get_by_role("menuitem", name="Add Time Point")).to_be_visible()

    # Choose Add Time Point
    page.get_by_role("menuitem", name="Add Time Point").hover(force=True)

    visible_menu = page.locator('[data-testid="vspan-submenu"]')
    expect(visible_menu).to_be_visible()

    for item in ("Disruption", "Thermal Quench", "Current Quench", "Control Loss"):
        expect(
            visible_menu.get_by_role("menuitem", name=item, exact=True)
        ).to_be_visible()

    # Click each type, check a new Vspan has been added
    visible_menu.get_by_role("menuitem", name=zone_type, exact=True).click(force=True)
    expect(page.get_by_label("vspan").first).to_be_visible()

    # Check added to list
    expect(page.get_by_role("rowheader", name=zone_type)).to_be_visible()

    # Wait for a bit for Vspan to fully render
    page.wait_for_timeout(200)

    # Check you can right click to delete it
    page.get_by_label("vspan").first.click(button="right", force=True)
    page.get_by_role("menuitem", name="Delete").click(force=True)

    # Wait for a bit for Vspan to fully delete
    page.wait_for_timeout(200)

    # # Check it no longer exists
    expect(page.get_by_role("rowheader", name=zone_type, exact=True)).to_have_count(0)
    expect(page.get_by_label("vspan")).to_have_count(0)


@pytest.mark.parametrize(
    "zone_type", ["Disruption", "Thermal Quench", "Current Quench", "Control Loss"]
)
@pytest.mark.parametrize("drag_to", [".wdrag", ".edrag"])
def test_timeseries_drag_vspan(drag_to: str, zone_type: str, server_setup, page: Page):
    # Create Project
    project_id = create_project("Test Project", "time-series", "parquet")
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
    page.get_by_role("menuitem", name="Add Time Point").click(force=True)

    visible_menu = page.locator('[data-testid="vspan-submenu"]')
    expect(visible_menu).to_be_visible()

    # Click each type, check a new Vspan has been added
    visible_menu.get_by_role("menuitem", name=zone_type, exact=True).click(force=True)
    expect(page.get_by_label("vspan").first).to_be_visible()

    # Check added to list, record initial positions
    expect(page.get_by_role("rowheader", name=zone_type)).to_be_visible()
    initial_position = float(
        page.get_by_role("row").nth(1).get_by_role("gridcell").nth(1).inner_text()
    )

    # Click handle, drag to new position
    page.get_by_label("vspan").drag_to(page.locator(drag_to))
    time.sleep(0.1)

    # Check values in table correctly updated
    updated_position = float(
        page.get_by_role("row").nth(1).get_by_role("gridcell").nth(1).inner_text()
    )

    if drag_to == ".wdrag":
        # Dragging left, position should have reduced
        assert updated_position < initial_position
    else:
        # Dragging right, position should be increased
        assert updated_position > initial_position


def test_timeseries_save_annotations(server_setup, page: Page):
    # Create Project
    project_id = create_project("Test Project", "time-series", "parquet")
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
    page.get_by_role("menuitem", name="Add Time Point").click(force=True)
    page.get_by_role("menuitem", name="Disruption", exact=True).click(force=True)

    expect(page.get_by_label("vspan").first).to_be_visible()

    # Drag to new position on right
    page.get_by_label("vspan").drag_to(page.locator(".edrag"))

    # Get value of position
    disruption_position = (
        page.get_by_role("row").nth(1).get_by_role("gridcell").nth(1).inner_text()
    )

    # Add a zone
    page.get_by_label("time-series").click(button="right")
    page.get_by_role("menuitem", name="Add Time Region").click(force=True)
    page.get_by_role("menuitem", name="Flat Top", exact=True).click(force=True)
    expect(page.get_by_label("zone").first).to_be_visible()

    # Click handle, drag to new position
    page.get_by_label("zone.leftHandle").drag_to(page.locator(".wdrag"))

    # Check added to list, record positions
    expect(page.get_by_role("rowheader", name="Flat Top")).to_be_visible()
    flattop_left_position = (
        page.get_by_role("row").nth(1).get_by_role("gridcell").nth(1).inner_text()
    )
    flattop_right_position = (
        page.get_by_role("row").nth(1).get_by_role("gridcell").nth(2).inner_text()
    )

    # Press Save
    page.get_by_role("button", name="Save").click(force=True)

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

    flattop_annotation = next(ann for ann in annotations if ann["label"] == "Flat Top")
    assert round(flattop_annotation["time_min"], 6) == float(flattop_left_position)
    assert round(flattop_annotation["time_max"], 6) == float(flattop_right_position)
    assert flattop_annotation["type"] == "time_region"


def test_timeseries_load_annotations(server_setup, page: Page):
    # Create Project
    project_id = create_project("Test Project", "time-series", "parquet")
    # And a sample for disruption
    ids = create_local_samples(
        project_id, [10000], pathlib.Path(__file__).parents[1], ["Ip"]
    )

    sample_id = ids[0]

    # Create annotations of each type
    rampup = TimeRegion(
        label="Ramp Up", created_by="peak_detection", time_min=10, time_max=20
    )
    flattop = TimeRegion(
        label="Flat Top", created_by="peak_detection", time_min=20, time_max=70
    )
    rampdown = TimeRegion(
        label="Ramp Down", created_by="peak_detection", time_min=70, time_max=90
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
    expect(page.get_by_label("zone", exact=True)).to_have_count(3)

    # Check all four entries have correct info in table
    row = page.get_by_role("row").filter(
        has=page.get_by_role("rowheader", name="Disruption")
    )
    assert float(row.get_by_role("gridcell").nth(1).inner_text()) == disruption.time

    row = page.get_by_role("row").filter(
        has=page.get_by_role("rowheader", name="Ramp Up")
    )
    assert float(row.get_by_role("gridcell").nth(1).inner_text()) == rampup.time_min
    assert float(row.get_by_role("gridcell").nth(2).inner_text()) == rampup.time_max

    row = page.get_by_role("row").filter(
        has=page.get_by_role("rowheader", name="Flat Top")
    )
    assert float(row.get_by_role("gridcell").nth(1).inner_text()) == flattop.time_min
    assert float(row.get_by_role("gridcell").nth(2).inner_text()) == flattop.time_max

    row = page.get_by_role("row").filter(
        has=page.get_by_role("rowheader", name="Ramp Down")
    )
    assert float(row.get_by_role("gridcell").nth(1).inner_text()) == rampdown.time_min
    assert float(row.get_by_role("gridcell").nth(2).inner_text()) == rampdown.time_max


def test_timeseries_update_annotations(server_setup, page: Page):
    # Create Project
    project_id = create_project("Test Project", "time-series", "parquet")
    # And a sample for disruption
    ids = create_local_samples(
        project_id, [10000], pathlib.Path(__file__).parents[1], ["Ip"]
    )

    sample_id = ids[0]

    # Create annotations of each type
    rampup = TimeRegion(
        label="Ramp Up", created_by="peak_detection", time_min=10, time_max=20
    )
    flattop = TimeRegion(
        label="Flat Top", created_by="peak_detection", time_min=20, time_max=70
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

    # One vspan and 2 zones visible
    expect(page.get_by_label("vspan").first).to_be_visible()
    expect(page.get_by_label("zone", exact=True)).to_have_count(2)

    # Delete a zone
    page.get_by_label("zone").first.click(button="right")
    expect(page.get_by_role("menuitem", name="Delete")).to_be_visible()
    page.get_by_role("menuitem", name="Delete").click(force=True)

    # Move the disruption
    # Click handle, drag to new position
    page.get_by_label("vspan").drag_to(page.locator(".edrag"))

    row = page.get_by_role("row").filter(
        has=page.get_by_role("rowheader", name="Disruption")
    )
    updated_disruption_time = float(row.get_by_role("gridcell").nth(1).inner_text())

    # Press Save
    page.get_by_role("button", name="Save").click(force=True)

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


def test_timeseries_annotator(server_setup, page: Page):
    # Create Project
    project_id = create_project("Test Project", "time-series", "parquet")
    # And a sample for disruption
    ids = create_local_samples(
        project_id, [10000], pathlib.Path(__file__).parents[1], ["Ip"]
    )

    sample_id = ids[0]

    # Navigate to page
    page.goto(f"http://localhost:8002/ui/projects/{project_id}/samples/{sample_id}")

    # Expand find peaks annotator
    expect(page.get_by_role("button", name="Peak Detection")).to_be_visible()
    page.get_by_role("button", name="Peak Detection").click()
    peak_detection = page.get_by_role("group", name="Peak Detection")
    expect(peak_detection).to_be_visible()
    peak_detection.get_by_role("switch", name="Enable Tool").click()

    # Choose ip
    peak_detection.get_by_role("button", name="Show suggestions Signal Name").click()
    page.get_by_role("option", name="Ip").click()

    # Check that 4 peaks have been identified
    expect(page.get_by_label("zone", exact=True)).to_have_count(4)

    # Disable tool, these should disappear
    peak_detection.get_by_role("switch", name="Enable Tool").click()
    expect(page.get_by_label("zone", exact=True)).to_have_count(0)

    # Enable tool, they should reappear
    peak_detection.get_by_role("switch", name="Enable Tool").click()
    expect(page.get_by_label("zone", exact=True)).to_have_count(4)

    # Change settings in toolbar, check they impact on annotations
    # Here drags min time to 74, so should only have one peak within window
    time_range = peak_detection.get_by_role("group", name="Time Range")
    min_slider = time_range.get_by_role("slider").nth(0)
    min_slider.scroll_into_view_if_needed()
    box = min_slider.bounding_box()
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.mouse.down()
    page.mouse.move(box["x"] + 140, box["y"])  # drag horizontally
    page.mouse.up()

    # Check one annotation present
    expect(page.get_by_label("zone", exact=True)).to_have_count(1)


def test_timeseries_model_predict(server_setup, setup_model_samples, page: Page):
    # Create Project
    project_id, sample_ids = create_model_samples(setup_model_samples)

    ids = create_local_samples(
        project_id, [10000], pathlib.Path(__file__).parents[1], ["Ip"]
    )

    sample_id = ids[0]

    # Navigate to page
    page.goto(f"http://localhost:8002/ui/projects/{project_id}/samples/{sample_id}")

    # Click on model train modal
    page.get_by_role("button", name="Train ML Model").click()

    # Check modal has opened
    expect(page.get_by_role("heading", name="Train ML Model")).to_be_visible()
    expect(page.get_by_role("combobox", name="Select Model Type")).to_be_visible()
    expect(page.get_by_role("button", name="Close")).to_be_visible()
    expect(page.get_by_role("button", name="Train", exact=True)).to_be_visible()

    # Click on dropdown box, check 'disruption_cnn' is shown
    page.get_by_role("button", name="Select Model Type").click()
    expect(
        page.get_by_role("option", name="disruption_cnn", exact=True)
    ).to_be_visible()
    expect(
        page.get_by_role("option", name="mock_timeseries_cnn", exact=True)
    ).to_be_visible()
    page.get_by_role("option", name="mock_timeseries_cnn", exact=True).click()

    # Click train, should get accepted message
    page.get_by_role("button", name="Train", exact=True).click()
    expect(page.get_by_text("Model training added to job queue!")).to_be_visible()

    # Close modal, check it disappears
    page.get_by_role("button", name="Close", exact=True).click()

    expect(page.get_by_role("heading", name="Train ML Model")).to_be_hidden()
    expect(page.get_by_role("combobox", name="Select Model Type")).to_be_hidden()
    expect(page.get_by_role("button", name="Close")).to_be_hidden()
    expect(page.get_by_role("button", name="Train", exact=True)).to_be_hidden()

    # Open predict modal, check structure is correct
    page.get_by_role("button", name="Create Predictions from ML Model").click()
    modal = page.get_by_role("dialog", name="Create Predictions from ML Model")

    expect(
        page.get_by_role("heading", name="Create Predictions from ML Model")
    ).to_be_visible()
    expect(modal.get_by_role("textbox", name="Number of Predictions")).to_be_visible()
    expect(
        modal.get_by_role("button", name="Cancel Training", exact=True)
    ).to_be_visible()
    expect(modal.get_by_role("button", name="Predict", exact=True)).to_be_visible()
    expect(modal.get_by_role("button", name="Predict", exact=True)).to_be_disabled()
    expect(modal.get_by_role("button", name="Close", exact=True)).to_be_visible()

    # Check entry is there for newly trained model, wait for it to complete
    expect(modal.get_by_role("row").nth(1)).to_contain_text("mock_timeseries_cnn")
    expect(modal.get_by_role("row").nth(1)).to_contain_text("completed", timeout=30000)
    expect(modal.get_by_role("row").nth(1)).to_contain_text("60")

    # Close modal
    modal.get_by_role("button", name="Close", exact=True).click()

    # Expand Model Predict in toolbar
    expect(page.get_by_role("button", name="Model Prediction")).to_be_visible()
    page.get_by_role("button", name="Model Prediction").click()
    model_predict = page.get_by_role("group", name="Model Prediction")
    expect(model_predict).to_be_visible()
    model_predict.get_by_role("switch", name="Enable Tool").click()

    # Choose mock_timeseries_cnn
    model_predict.get_by_role(
        "combobox", name="Select Model Type"
    ).scroll_into_view_if_needed()
    model_predict.get_by_role(
        "button", name="Show suggestions Select Model Type"
    ).click()
    page.get_by_role("option", name="mock_timeseries_cnn").click()

    # Should generate a new set of predictions after a short time
    expect(page.get_by_label("vspan", exact=True)).to_have_count(1)
    expect(page.get_by_label("zone", exact=True)).to_have_count(2)

    # Check added to list
    expect(page.get_by_role("rowheader", name="Disruption")).to_be_visible()
    expect(page.get_by_role("rowheader", name="Ramp Up")).to_be_visible()
    expect(page.get_by_role("rowheader", name="Flat Top")).to_be_visible()

    # Disable tool, it should disappear
    model_predict.get_by_role("switch", name="Enable Tool").click()
    expect(page.get_by_label("vspan", exact=True)).to_have_count(0)
    expect(page.get_by_label("zone", exact=True)).to_have_count(0)

    expect(page.get_by_role("rowheader", name="Disruption")).to_be_hidden()
    expect(page.get_by_role("rowheader", name="Ramp Up")).to_be_hidden()
    expect(page.get_by_role("rowheader", name="Flat Top")).to_be_hidden()

    # Enable tool, it should reappear
    model_predict.get_by_role("switch", name="Enable Tool").click()
    expect(page.get_by_label("vspan", exact=True)).to_have_count(1)
    expect(page.get_by_label("zone", exact=True)).to_have_count(2)

    expect(page.get_by_role("rowheader", name="Disruption")).to_be_visible()
    expect(page.get_by_role("rowheader", name="Ramp Up")).to_be_visible()
    expect(page.get_by_role("rowheader", name="Flat Top")).to_be_visible()
