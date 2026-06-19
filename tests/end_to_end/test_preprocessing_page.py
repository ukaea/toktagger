import pathlib
import time

import pytest
from playwright.sync_api import Page, expect

from tests.endpoints import create_local_samples, create_project


def setup_timeseries_project(page: Page, num_samples: int = 1):
    project_id = create_project("Preprocessing Test Project", "time-series", "tabular")
    base_path = pathlib.Path(__file__).parents[1]
    sample_ids = create_local_samples(
        project_id,
        list(range(10000, 10000 + num_samples)),
        base_path,
        ["Ip"],
        ["10000.parquet"] * num_samples,
    )
    page.goto(f"http://localhost:8002/ui/projects/{project_id}/samples/{sample_ids[0]}")
    expect(page.get_by_label("time-series")).to_be_visible()
    return project_id, sample_ids


def open_preprocessing_panel(page: Page):
    page.get_by_role("button", name="Signal Preprocessing").click()
    panel = page.get_by_role("group", name="Signal Preprocessing")
    expect(panel).to_be_visible()
    return panel


def select_signal(page: Page, panel, signal_name: str = "Ip"):
    panel.get_by_role("button", name="Show suggestions Signal").click()
    page.get_by_role("option", name=signal_name).click()


def test_preprocessing_panel_visible(server_setup, page: Page):
    setup_timeseries_project(page)
    expect(page.get_by_role("button", name="Signal Preprocessing")).to_be_visible()


def test_add_step_disabled_without_signal(server_setup, page: Page):
    setup_timeseries_project(page)
    panel = open_preprocessing_panel(page)
    expect(panel.get_by_role("button", name="Add Step")).to_be_disabled()


def test_add_step_enabled_after_signal_selection(server_setup, page: Page):
    setup_timeseries_project(page)
    panel = open_preprocessing_panel(page)
    select_signal(page, panel)
    expect(panel.get_by_role("button", name="Add Step")).to_be_enabled()


def test_add_smoothing_step_appears_in_applied_list(server_setup, page: Page):
    setup_timeseries_project(page)
    panel = open_preprocessing_panel(page)
    select_signal(page, panel)
    panel.get_by_role("button", name="Add Step").click()

    expect(panel.get_by_text("Applied Steps")).to_be_visible()
    expect(panel.get_by_text("Smoothing", exact=False)).to_be_visible()


def test_clear_all_removes_applied_steps(server_setup, page: Page):
    setup_timeseries_project(page)
    panel = open_preprocessing_panel(page)
    select_signal(page, panel)
    panel.get_by_role("button", name="Add Step").click()

    expect(panel.get_by_text("Applied Steps")).to_be_visible()

    panel.get_by_role("button", name="Clear All").click()

    expect(panel.get_by_text("Applied Steps")).not_to_be_visible()


def test_remove_individual_step(server_setup, page: Page):
    setup_timeseries_project(page)
    panel = open_preprocessing_panel(page)
    select_signal(page, panel)

    # Add two steps
    panel.get_by_role("button", name="Add Step").click()
    panel.get_by_role("button", name="Add Step").click()

    # Both steps numbered 1 and 2 should appear
    expect(panel.get_by_text("1.", exact=False)).to_be_visible()
    expect(panel.get_by_text("2.", exact=False)).to_be_visible()

    # Remove the first one
    panel.get_by_role("button", name="✕").first.click()

    # Only one step should remain, renumbered as 1
    expect(panel.get_by_text("1.", exact=False)).to_be_visible()
    expect(panel.get_by_text("2.", exact=False)).not_to_be_visible()


def test_step_type_picker_changes_controls(server_setup, page: Page):
    setup_timeseries_project(page)
    panel = open_preprocessing_panel(page)

    # Default is Smoothing — sigma slider should be visible
    expect(panel.get_by_role("slider", name="Sigma", exact=False)).to_be_visible()

    # Switch to Background Subtraction
    panel.get_by_role("button", name="Smoothing").click()
    page.get_by_role("option", name="Background Subtraction").click()
    expect(panel.get_by_role("spinbutton", name="Window Size")).to_be_visible()
    expect(panel.get_by_role("slider", name="Sigma", exact=False)).not_to_be_visible()

    # Switch to Normalisation
    panel.get_by_role("button", name="Background Subtraction").click()
    page.get_by_role("option", name="Normalisation").click()
    expect(panel.get_by_role("button", name="Z-Score")).to_be_visible()


@pytest.mark.parametrize(
    "step_type,step_label",
    [
        ("Smoothing", "Smoothing"),
        ("Background Subtraction", "BG Subtraction"),
        ("Normalisation", "Normalisation"),
    ],
)
def test_each_step_type_can_be_added(
    server_setup, page: Page, step_type: str, step_label: str
):
    setup_timeseries_project(page)
    panel = open_preprocessing_panel(page)

    if step_type != "Smoothing":
        panel.get_by_role("button", name="Smoothing").click()
        page.get_by_role("option", name=step_type).click()

    select_signal(page, panel)
    panel.get_by_role("button", name="Add Step").click()

    expect(panel.get_by_text("Applied Steps")).to_be_visible()
    expect(panel.get_by_text(step_label, exact=False)).to_be_visible()


def test_preprocessing_persists_across_shot_navigation(server_setup, page: Page):
    project_id, sample_ids = setup_timeseries_project(page, num_samples=2)
    sample_id_1, sample_id_2 = sample_ids

    # Add a preprocessing step on the first sample
    panel = open_preprocessing_panel(page)
    select_signal(page, panel)
    panel.get_by_role("button", name="Add Step").click()
    expect(panel.get_by_text("Applied Steps")).to_be_visible()

    # Navigate to the second sample
    page.goto(f"http://localhost:8002/ui/projects/{project_id}/samples/{sample_id_2}")
    expect(page.get_by_label("time-series")).to_be_visible()
    time.sleep(0.5)

    # Open preprocessing panel on the new sample
    panel = open_preprocessing_panel(page)

    # The committed step should still be listed
    expect(panel.get_by_text("Applied Steps")).to_be_visible()
    expect(panel.get_by_text("Smoothing", exact=False)).to_be_visible()
