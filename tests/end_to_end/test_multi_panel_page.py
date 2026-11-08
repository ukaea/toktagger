import requests
from playwright.sync_api import Page, expect

LAYOUT = {
    "panels": [
        {
            "id": "radial",
            "title": "Radial profiles",
            "kind": "radial_profile",
            "profile_signals": ["TE", "NE"],
            "time_series_signals": ["ip"],
            "grid": {"col": 1, "row": 1},
        },
        {
            "id": "spectrogram",
            "title": "Spectrogram",
            "kind": "profile_2d",
            "signal": "TE",
            "grid": {"col": 2, "row": 1},
        },
        {
            "id": "traces",
            "title": "Traces",
            "kind": "time_series",
            "signals": ["ip"],
            "grid": {"col": 1, "row": 2, "col_span": 2},
        },
    ]
}

PLOT_IDS = {
    "radial": "RadialProfileRadial-radial",
    "spectrogram": "Profile2DView-spectrogram",
    "traces": "TimesSeriesView-traces",
}


def setup_project(page: Page) -> tuple[str, str]:
    response = requests.post(
        "http://localhost:8002/projects",
        json={
            "name": "Test Multi Panel Project",
            "task": "multi-panel",
            "query_strategy": "random",
            "data_loader": "synthetic_radial",
            "layout": LAYOUT,
        },
    )
    assert response.status_code == 200, response.text
    project_id = response.json()["_id"]

    response = requests.post(
        f"http://localhost:8002/projects/{project_id}/samples",
        json=[{"shot_id": 1, "data": {"protocol": "uda", "signal_names": ["TE"]}}],
    )
    assert response.status_code == 200, response.text
    sample_id = response.json()[0]

    with page.expect_response(lambda r: "panels/traces/data" in r.url):
        page.goto(f"http://localhost:8002/ui/projects/{project_id}/samples/{sample_id}")
    expect(page.get_by_test_id("workspace")).to_be_visible()
    return project_id, sample_id


def test_multi_panel_renders_every_panel(server_setup, page: Page):
    setup_project(page)

    for panel_id, plot_id in PLOT_IDS.items():
        panel = page.get_by_test_id(f"panel-{panel_id}")
        expect(panel).to_be_visible()
        expect(panel.locator(f"#{plot_id} .main-svg").first).to_be_visible()


def test_multi_panel_toolbar_follows_active_panel(server_setup, page: Page):
    setup_project(page)
    tools = page.get_by_test_id("panel-tools")

    page.get_by_test_id("panel-traces").get_by_role("heading", name="Traces").click()
    expect(page.get_by_test_id("panel-traces")).to_have_attribute("data-active", "true")
    expect(tools.get_by_text("Peak Detection")).to_be_visible()

    page.get_by_test_id("panel-spectrogram").get_by_role(
        "heading", name="Spectrogram"
    ).click()
    expect(page.get_by_test_id("panel-spectrogram")).to_have_attribute(
        "data-active", "true"
    )
    expect(tools.get_by_text("View Parameters")).to_be_visible()
    expect(tools.get_by_text("Peak Detection")).to_have_count(0)


def x_range(page: Page, plot_id: str) -> list[float]:
    return page.evaluate(
        "(plotId) => document.getElementById(plotId).layout.xaxis.range", plot_id
    )


def test_multi_panel_zoom_links_time_axes(server_setup, page: Page):
    setup_project(page)
    traces_plot = f"#{PLOT_IDS['traces']}"

    page.locator(f"{traces_plot} [data-title='Zoom']").click()
    box = page.locator(f"{traces_plot} .nsewdrag").first.bounding_box()
    assert box is not None
    y = box["y"] + box["height"] * 0.5
    page.mouse.move(box["x"] + box["width"] * 0.3, y)
    page.mouse.down()
    page.mouse.move(box["x"] + box["width"] * 0.6, y, steps=10)
    page.mouse.up()

    zoomed = x_range(page, PLOT_IDS["traces"])
    for plot_id in [PLOT_IDS["spectrogram"], "RadialProfileTime-radial"]:
        page.wait_for_function(
            """([plotId, range]) => {
                const shown = document.getElementById(plotId).layout.xaxis.range;
                return Math.abs(shown[0] - range[0]) < 1e-9
                    && Math.abs(shown[1] - range[1]) < 1e-9;
            }""",
            arg=[plot_id, zoomed],
        )


def test_multi_panel_time_region_shows_on_all_time_panels(server_setup, page: Page):
    setup_project(page)
    traces = page.get_by_test_id("panel-traces")

    traces.get_by_role("button", name="View Mode").click()
    # The mode button opens a help popover that blocks the toolbar.
    page.keyboard.press("Escape")
    traces.get_by_role("button", name="TIME REGION").click()
    traces.get_by_test_id("select-annotation-label").click()
    page.get_by_test_id("popover").get_by_text("Flat Top").click()
    expect(page.get_by_test_id("popover")).to_have_count(0)

    box = traces.get_by_label("time-series").bounding_box()
    assert box is not None
    x = box["x"] + box["width"] / 2
    y = box["y"] + box["height"] / 2
    page.mouse.move(x, y)
    page.keyboard.down("Control")
    page.mouse.down()
    page.mouse.move(x + 150, y, steps=20)
    page.mouse.up()
    page.keyboard.up("Control")

    expect(traces.get_by_label("time-zone").first).to_be_visible()
    expect(
        page.get_by_test_id("panel-radial").get_by_label("time-zone").first
    ).to_be_attached()
    expect(
        page.get_by_test_id("panel-spectrogram").get_by_label("time-zone").first
    ).to_be_attached()
