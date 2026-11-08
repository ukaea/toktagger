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

TABBED_LAYOUT = {
    "tabs": [
        {"title": "Profiles", "panels": LAYOUT["panels"][:2]},
        {
            "title": "Signals",
            "panels": [{**LAYOUT["panels"][2], "grid": {"col": 1, "row": 1}}],
        },
    ]
}

PLOT_IDS = {
    "radial": "RadialProfileRadial-radial",
    "spectrogram": "Profile2DView-spectrogram",
    "traces": "TimesSeriesView-traces",
}


def setup_project(page: Page, layout: dict = LAYOUT) -> tuple[str, str]:
    response = requests.post(
        "http://localhost:8002/projects",
        json={
            "name": "Test Multi Panel Project",
            "task": "multi-panel",
            "query_strategy": "random",
            "data_loader": "synthetic_radial",
            "layout": layout,
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


def test_multi_panel_annotation_tools_follow_active_panel(server_setup, page: Page):
    setup_project(page)
    toolbar = page.get_by_test_id("annotation-toolbar")

    page.get_by_test_id("panel-traces").get_by_role("heading", name="Traces").click()
    expect(toolbar.get_by_role("button", name="TIME REGION")).to_be_visible()
    expect(toolbar.get_by_role("button", name="BOUNDING BOX")).to_have_count(0)

    page.get_by_test_id("panel-spectrogram").get_by_role(
        "heading", name="Spectrogram"
    ).click()
    expect(toolbar.get_by_role("button", name="BOUNDING BOX")).to_be_visible()
    expect(toolbar.get_by_role("button", name="POLYGON")).to_be_visible()


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


def test_multi_panel_has_one_annotation_toolbar_and_table(server_setup, page: Page):
    setup_project(page)

    expect(page.get_by_test_id("annotation-toolbar")).to_have_count(1)
    expect(page.get_by_role("grid", name="Annotations table")).to_have_count(1)
    for panel_id in PLOT_IDS:
        panel = page.get_by_test_id(f"panel-{panel_id}")
        expect(panel.get_by_test_id("annotation-toolbar")).to_have_count(0)


def test_multi_panel_edit_mode_shortcut_toggles_once(server_setup, page: Page):
    setup_project(page)
    toolbar = page.get_by_test_id("annotation-toolbar")
    expect(toolbar.get_by_role("button", name="View Mode")).to_be_visible()

    page.locator("body").press("e")
    expect(toolbar.get_by_role("button", name="Edit Mode")).to_be_visible()
    page.locator("body").press("e")
    expect(toolbar.get_by_role("button", name="View Mode")).to_be_visible()


def draw_time_region(page: Page, panel_id: str):
    toolbar = page.get_by_test_id("annotation-toolbar")
    toolbar.get_by_role("button", name="View Mode").click()
    # The mode button opens a help popover that blocks the toolbar.
    page.keyboard.press("Escape")
    toolbar.get_by_role("button", name="TIME REGION").click()
    toolbar.get_by_test_id("select-annotation-label").click()
    page.get_by_test_id("popover").get_by_text("Flat Top").click()
    expect(page.get_by_test_id("popover")).to_have_count(0)

    box = (
        page.get_by_test_id(f"panel-{panel_id}")
        .get_by_label("time-series")
        .bounding_box()
    )
    assert box is not None
    x = box["x"] + box["width"] / 2
    y = box["y"] + box["height"] / 2
    page.mouse.move(x, y)
    page.keyboard.down("Control")
    page.mouse.down()
    page.mouse.move(x + 150, y, steps=20)
    page.mouse.up()
    page.keyboard.up("Control")


def test_multi_panel_time_region_shows_on_all_time_panels(server_setup, page: Page):
    setup_project(page)
    draw_time_region(page, "traces")

    expect(
        page.get_by_test_id("panel-traces").get_by_label("time-zone").first
    ).to_be_visible()
    expect(
        page.get_by_test_id("panel-radial").get_by_label("time-zone").first
    ).to_be_attached()
    expect(
        page.get_by_test_id("panel-spectrogram").get_by_label("time-zone").first
    ).to_be_attached()

    row = (
        page.get_by_role("grid", name="Annotations table")
        .get_by_role("row")
        .filter(has=page.get_by_role("gridcell", name="Flat Top"))
    )
    expect(row).to_have_count(1)
    expect(row.get_by_role("gridcell", name="All")).to_be_visible()


def test_multi_panel_single_tab_has_no_tab_bar(server_setup, page: Page):
    setup_project(page)
    expect(page.get_by_role("tablist")).to_have_count(0)


def test_multi_panel_tabs_switch_panels(server_setup, page: Page):
    setup_project(page, TABBED_LAYOUT)
    tabs = page.get_by_role("tablist")
    expect(tabs.get_by_role("tab")).to_have_text(["Profiles", "Signals"])
    expect(page.get_by_test_id("panel-radial")).to_be_visible()
    expect(page.get_by_test_id("panel-traces")).to_have_count(0)

    tabs.get_by_role("tab", name="Signals").click()
    expect(page.get_by_test_id("panel-radial")).to_have_count(0)
    expect(page.get_by_test_id("panel-traces")).to_have_attribute("data-active", "true")
    expect(
        page.get_by_test_id("panel-tools").get_by_text("Peak Detection")
    ).to_be_visible()

    with page.expect_response(lambda r: "panels/traces/data" in r.url):
        page.reload()
    expect(tabs.get_by_role("tab", name="Signals")).to_have_attribute(
        "aria-selected", "true"
    )
    expect(page.get_by_test_id("panel-traces")).to_be_visible()


def test_multi_panel_annotation_shows_on_other_tab(server_setup, page: Page):
    setup_project(page, TABBED_LAYOUT)
    page.get_by_role("tab", name="Signals").click()
    draw_time_region(page, "traces")
    expect(
        page.get_by_test_id("panel-traces").get_by_label("time-zone").first
    ).to_be_visible()

    # Switching at once proves that an unsynced edit survives the unmount of its panel.
    page.get_by_role("tab", name="Profiles").click()
    expect(
        page.get_by_test_id("panel-spectrogram").get_by_label("time-zone").first
    ).to_be_attached()
    row = (
        page.get_by_role("grid", name="Annotations table")
        .get_by_role("row")
        .filter(has=page.get_by_role("gridcell", name="Flat Top"))
    )
    expect(row).to_have_count(1)


def test_create_and_edit_multi_panel_project(server_setup, page: Page):
    page.goto("http://localhost:8002")
    page.get_by_role("button", name="Create").click()
    modal = page.get_by_role("dialog")

    modal.get_by_role("textbox", name="Project Name").fill("UI Multi Panel")
    modal.get_by_role("button", name="Task").click()
    page.get_by_role("option", name="multi-panel").click()
    expect(modal.get_by_role("combobox", name="Data Loader")).to_be_hidden()

    modal.get_by_role("tab", name="Form").click()
    modal.get_by_role("button", name="Data loader").click()
    page.get_by_role("option", name="synthetic_radial", exact=True).click()
    modal.get_by_role("textbox", name="Signals (comma separated)").fill("ip, TE")
    modal.get_by_role("button", name="Add panel").click()
    expect(modal.get_by_test_id("layout-panel")).to_have_count(2)
    second_panel = modal.get_by_test_id("layout-panel").nth(1)
    second_panel.get_by_role("button", name="Kind").click()
    page.get_by_role("option", name="Profile 2D / spectrogram").click()
    second_panel.get_by_role("textbox", name="Signal", exact=True).fill("TE")

    with page.expect_response(
        lambda r: r.url.endswith("/projects") and r.request.method == "POST"
    ):
        modal.get_by_role("button", name="Create").click()

    project = requests.get("http://localhost:8002/projects").json()[0]
    assert project["task"] == "multi-panel"
    assert project["data_loader"] == "synthetic_radial"
    assert project["sources"] == [
        {"name": "default", "data_loader": "synthetic_radial"}
    ]
    assert [tab["title"] for tab in project["layout"]["tabs"]] == ["Main"]
    assert project["layout_yaml"].startswith("# The data sources")
    panels = project["layout"]["tabs"][0]["panels"]
    assert [panel["kind"] for panel in panels] == ["time_series", "profile_2d"]
    assert panels[0]["signals"] == ["ip", "TE"]
    assert panels[1]["signal"] == "TE"
    assert panels[1]["grid"]["row"] == 2

    page.get_by_role("row").nth(1).get_by_role("button", name="Edit").click()
    modal = page.get_by_role("dialog")
    modal.get_by_role("textbox", name="Project Name").fill("UI Multi Panel 2")
    with page.expect_response(
        lambda r: f"/projects/{project['_id']}" in r.url and r.request.method == "PUT"
    ) as response_info:
        modal.get_by_role("button", name="Save Changes").click()
    assert response_info.value.ok

    updated = requests.get(f"http://localhost:8002/projects/{project['_id']}").json()
    assert updated["name"] == "UI Multi Panel 2"
    assert updated["layout"]["tabs"][0]["panels"] == panels


LAYOUT_YAML = """# Two tabs for the review.
sources:
  - name: default
    data_loader: synthetic_radial
layout:
  tabs:
    - title: Profiles
      panels:
        - id: spectrogram
          kind: profile_2d
          signal: TE
    - title: Signals
      panels:
        - id: traces
          kind: time_series
          signals: [ip]
"""


def open_multi_panel_dialog(page: Page):
    page.goto("http://localhost:8002")
    page.get_by_role("button", name="Create").click()
    modal = page.get_by_role("dialog")
    modal.get_by_role("textbox", name="Project Name").fill("YAML Multi Panel")
    modal.get_by_role("button", name="Task").click()
    page.get_by_role("option", name="multi-panel").click()
    return modal


def test_create_multi_panel_project_from_yaml(server_setup, page: Page):
    modal = open_multi_panel_dialog(page)
    editor = modal.get_by_role("textbox", name="Layout YAML")
    editor.fill(LAYOUT_YAML)
    expect(modal.get_by_role("alert", name="Layout errors")).to_have_count(0)

    with page.expect_response(
        lambda r: r.url.endswith("/projects") and r.request.method == "POST"
    ):
        modal.get_by_role("button", name="Create").click()

    project = requests.get("http://localhost:8002/projects").json()[0]
    assert project["layout_yaml"] == LAYOUT_YAML
    assert [tab["title"] for tab in project["layout"]["tabs"]] == [
        "Profiles",
        "Signals",
    ]

    page.get_by_role("row").nth(1).get_by_role("button", name="Edit").click()
    modal = page.get_by_role("dialog")
    expect(modal.get_by_role("textbox", name="Layout YAML")).to_have_value(LAYOUT_YAML)

    modal.get_by_role("tab", name="Form").click()
    modal.get_by_role("button", name="Add tab").click()
    expect(modal.get_by_test_id("layout-tab")).to_have_count(3)
    modal.get_by_role("tab", name="YAML").click()
    text = modal.get_by_role("textbox", name="Layout YAML").input_value()
    assert text.startswith("# Two tabs for the review.")
    assert "title: Tab 3" in text


def test_invalid_layout_yaml_blocks_create(server_setup, page: Page):
    modal = open_multi_panel_dialog(page)
    modal.get_by_role("textbox", name="Layout YAML").fill(
        LAYOUT_YAML.replace("id: traces", "id: spectrogram")
    )
    expect(modal.get_by_role("alert", name="Layout errors")).to_contain_text(
        "Panel ids must be unique"
    )
    modal.get_by_role("button", name="Create").click()
    expect(modal).to_be_visible()
    assert requests.get("http://localhost:8002/projects").json() == []
