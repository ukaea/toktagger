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
