from typing import Tuple

import requests
from playwright.sync_api import Page, expect

from tests.endpoints import create_project, create_uda_samples
from tests.radial_definitions import RADIAL_TIME

RADIAL_PLOT_ID = "RadialProfileRadial"
TIME_PLOT_ID = "RadialProfileTime"
# One radial subplot, plus the slice strip and one subplot per 1D signal ("ip").
NUM_SUBPLOTS = 3
NUM_TIME_SUBPLOTS = 2


def setup_project(page: Page) -> Tuple[str, str]:
    project_id = create_project(
        "Test Radial Profile Project", "radial-profile", "synthetic_radial"
    )
    sample_id = create_uda_samples(project_id, [1], signal_names=["TE", "R", "ip"])[0]

    page.goto(f"http://localhost:8002/ui/projects/{project_id}/samples/{sample_id}")
    expect(page.get_by_label("radial-profile", exact=True)).to_be_visible()
    expect(page.get_by_label("radial-profile-time")).to_be_visible()
    expect(page.locator(".nsewdrag")).to_have_count(NUM_SUBPLOTS)
    return project_id, sample_id


def radial_trace_count(page: Page) -> int:
    return page.evaluate(
        "(plotId) => document.getElementById(plotId).data.length", RADIAL_PLOT_ID
    )


def enter_edit_mode(page: Page) -> None:
    page.get_by_role("button", name="View Mode").click()
    page.locator("body").click()
    expect(page.get_by_role("button", name="Edit Mode")).to_be_enabled()


def select_tool(page: Page, tool: str, label: str) -> None:
    page.get_by_role("button", name=tool).click()
    page.get_by_test_id("select-annotation-label").click()
    page.get_by_test_id("popover").get_by_text(label).click()
    expect(page.get_by_test_id("select-annotation-label")).to_contain_text(label)
    # The closing label popover blocks pointer events on the plots until it is gone.
    expect(page.get_by_test_id("popover")).to_have_count(0)


def ctrl_drag(page: Page, plot_id: str, start: float, end: float) -> None:
    # Last subplot: on the time plot this is a signal, not the thin slice strip.
    target = page.locator(f"#{plot_id} .nsewdrag").last
    target.scroll_into_view_if_needed()
    box = target.bounding_box()
    assert box is not None
    x = box["x"] + box["width"] * start
    y = box["y"] + box["height"] * 0.5
    # Raw mouse events skip Playwright's hit-target check, and toolbar presses briefly block hits.
    page.wait_for_function(
        "([id, x, y]) => document.getElementById(id).contains(document.elementFromPoint(x, y))",
        arg=[plot_id, x, y],
    )
    page.mouse.move(x, y)
    page.keyboard.down("Control")
    page.mouse.down()
    page.mouse.move(box["x"] + box["width"] * end, y, steps=20)
    page.mouse.up()
    page.keyboard.up("Control")


def save(page: Page, sample_id: str) -> None:
    with page.expect_response(
        lambda r: (
            f"samples/{sample_id}/annotations" in r.url and r.request.method == "PUT"
        )
    ):
        page.get_by_role("button", name="Save").click(force=True)


def test_radial_profile_renders_all_slices(server_setup, page: Page):
    setup_project(page)
    assert radial_trace_count(page) == len(RADIAL_TIME)


def zoom_time_plot(page: Page) -> None:
    # A zoom-box drag relayouts once on release, unlike scroll zoom which keeps firing.
    page.locator(f"#{TIME_PLOT_ID} [data-title='Zoom']").click()
    box = page.locator(f"#{TIME_PLOT_ID} .nsewdrag").last.bounding_box()
    assert box is not None
    y = box["y"] + box["height"] * 0.5
    page.mouse.move(box["x"] + box["width"] * 0.3, y)
    page.mouse.down()
    page.mouse.move(box["x"] + box["width"] * 0.6, y, steps=10)
    page.mouse.up()
    page.wait_for_function(
        "([plotId, total]) => document.getElementById(plotId).data.length < total",
        arg=[RADIAL_PLOT_ID, len(RADIAL_TIME)],
    )


def test_radial_profile_time_zoom_limits_slices(server_setup, page: Page):
    setup_project(page)
    zoom_time_plot(page)


def test_radial_profile_range_uses_zoomed_time_window(server_setup, page: Page):
    project_id, sample_id = setup_project(page)
    zoom_time_plot(page)

    enter_edit_mode(page)
    select_tool(page, "BOUNDING BOX", "NTM")
    ctrl_drag(page, RADIAL_PLOT_ID, 0.3, 0.6)
    expect(page.get_by_label("radial-range-radius", exact=True)).to_have_count(1)

    page.get_by_role("button", name="Edit Mode").click()
    expect(page.get_by_role("button", name="View Mode")).to_be_enabled()
    save(page, sample_id)

    box = requests.get(
        f"http://localhost:8002/projects/{project_id}/samples/{sample_id}/annotations"
    ).json()[0]
    # The time span is the zoomed window, not the whole shot.
    assert box["x_min"] > RADIAL_TIME[0]
    assert box["x_min"] + box["width"] < RADIAL_TIME[-1]


def test_radial_profile_draw_and_edit_radial_range(server_setup, page: Page):
    project_id, sample_id = setup_project(page)

    enter_edit_mode(page)
    select_tool(page, "BOUNDING BOX", "NTM")
    ctrl_drag(page, RADIAL_PLOT_ID, 0.3, 0.6)

    expect(page.get_by_label("radial-range-radius", exact=True)).to_have_count(1)
    expect(page.get_by_label("radial-range-time", exact=True)).to_have_count(
        NUM_TIME_SUBPLOTS
    )
    expect(page.get_by_role("gridcell", name="NTM")).to_be_visible()

    # Narrow the time span by dragging the right-hand time edge to the middle of the shot.
    handle = page.get_by_label("radial-range-time-handle-1").last
    handle_box = handle.bounding_box()
    plot_box = page.locator(f"#{TIME_PLOT_ID} .nsewdrag").last.bounding_box()
    assert handle_box is not None and plot_box is not None
    y = handle_box["y"] + handle_box["height"] / 2
    page.mouse.move(handle_box["x"] + handle_box["width"] / 2, y)
    page.mouse.down()
    page.mouse.move(plot_box["x"] + plot_box["width"] * 0.5, y, steps=10)
    page.mouse.up()

    page.get_by_role("button", name="Edit Mode").click()
    expect(page.get_by_role("button", name="View Mode")).to_be_enabled()
    save(page, sample_id)

    annotations = requests.get(
        f"http://localhost:8002/projects/{project_id}/samples/{sample_id}/annotations"
    ).json()
    assert len(annotations) == 1
    box = annotations[0]
    assert box["type"] == "bounding_box"
    assert box["label"] == "NTM"
    assert box["signal_name"] == "TE"
    # Time span starts at the first slice and now ends mid-shot.
    assert box["x_min"] == RADIAL_TIME[0]
    assert box["x_min"] + box["width"] < RADIAL_TIME[-1] * 0.75
    # Radius span (channel index here) covers part of the profile.
    assert 1 <= box["y_min"] and box["y_min"] + box["height"] <= 20

    page.reload()
    expect(page.get_by_label("radial-range-radius", exact=True)).to_have_count(1)


def test_radial_profile_range_survives_time_zoom_reset(server_setup, page: Page):
    setup_project(page)
    zoom_time_plot(page)

    enter_edit_mode(page)
    select_tool(page, "BOUNDING BOX", "NTM")
    ctrl_drag(page, RADIAL_PLOT_ID, 0.3, 0.6)
    expect(page.get_by_label("radial-range-radius", exact=True)).to_have_count(1)

    page.locator(f"#{TIME_PLOT_ID} [data-title='Reset axes']").click()
    page.wait_for_function(
        "([plotId, total]) => document.getElementById(plotId).data.length === total",
        arg=[RADIAL_PLOT_ID, len(RADIAL_TIME)],
    )
    expect(page.get_by_label("radial-range-radius", exact=True)).to_have_count(1)
    expect(page.get_by_label("radial-range-time", exact=True)).to_have_count(
        NUM_TIME_SUBPLOTS
    )


def test_radial_profile_time_tools_only_draw_on_time_plot(server_setup, page: Page):
    setup_project(page)

    enter_edit_mode(page)
    select_tool(page, "TIME REGION", "ELM")
    ctrl_drag(page, TIME_PLOT_ID, 0.3, 0.6)
    expect(page.get_by_label("time-zone")).to_have_count(NUM_TIME_SUBPLOTS)
    expect(page.get_by_role("gridcell", name="ELM")).to_have_count(1)

    ctrl_drag(page, RADIAL_PLOT_ID, 0.3, 0.6)
    expect(
        page.get_by_text("annotations cannot be drawn on this plot", exact=False)
    ).to_be_visible()
    expect(page.get_by_role("gridcell", name="ELM")).to_have_count(1)


def test_radial_profile_tools_disabled_in_view_mode(server_setup, page: Page):
    setup_project(page)

    expect(page.get_by_role("button", name="TIME REGION")).to_be_disabled()
    expect(page.get_by_role("button", name="BOUNDING BOX")).to_be_disabled()

    ctrl_drag(page, RADIAL_PLOT_ID, 0.3, 0.6)
    expect(
        page.get_by_text("Change to Edit Mode to draw annotations", exact=False)
    ).to_be_visible()
    expect(page.get_by_role("gridcell")).to_have_count(0)
