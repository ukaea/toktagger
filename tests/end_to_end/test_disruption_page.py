from playwright.sync_api import Page, expect
import pathlib
from tests.endpoints import (
    create_project,
    create_local_samples,
)
import pytest


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
    expect(page.locator(".zone").first).to_be_visible()

    # Check added to list
    expect(page.get_by_role("rowheader", name=zone_type)).to_be_visible()

    # Check you can right click to delete it
    page.locator(".zone").first.click(button="right")
    expect(page.get_by_role("menuitem", name="Delete")).to_be_visible()
    page.get_by_role("menuitem", name="Delete").click()

    # Check it no longer exists
    expect(page.locator(".zone").first).to_be_hidden()
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
    expect(page.locator(".zone").first).to_be_visible()

    # Check added to list, record initial positions
    expect(page.get_by_role("rowheader", name=zone_type)).to_be_visible()
    initial_left_position = (
        page.get_by_role("row").nth(1).get_by_role("cell").nth(0).inner_text()
    )
    initial_right_position = (
        page.get_by_role("row").nth(1).get_by_role("cell").nth(1).inner_text()
    )

    # Click handle, drag to new position
    page.locator(f".zone.{handle}").drag_to(page.locator(drag_to))

    # Check values in table correctly updated
    updated_left_position = (
        page.get_by_role("row").nth(1).get_by_role("cell").nth(0).inner_text()
    )
    updated_right_position = (
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
