from playwright.sync_api import Page, expect
import pathlib
from tests.endpoints import (
    create_project,
    create_local_samples,
    create_uda_samples,
)
import pytest


def check_base_page(page):
    # Expect page is called TokTagger
    expect(page).to_have_title("TokTagger")

    # Expect breadcrumbs at the top to be visible, and showing Projects & Samples link
    expect(page.get_by_role("link", name="Projects")).to_be_visible()
    expect(page.get_by_role("link", name="Project: Test Project")).to_be_visible()

    # Expect toolbar on left hand side to contain appropriate buttons
    expect(page.get_by_text("Controls")).to_be_visible()
    expect(page.get_by_role("button", name="Save")).to_be_visible()
    expect(page.get_by_role("button", name="Next")).to_be_visible()
    expect(page.get_by_role("button", name="Previous")).to_be_visible()
    expect(page.get_by_role("button", name="Clear", exact=True)).to_be_visible()
    expect(page.get_by_role("checkbox", name="Save on Navigate")).to_be_visible()
    expect(page.get_by_role("searchbox", name="Jump to Shot")).to_be_visible()

    # Check export and import annotations dropdowns present
    expect(page.get_by_role("button", name="Export Annotations")).to_be_visible()
    page.get_by_role("button", name="Export Annotations").click()
    expect(page.get_by_role("group", name="Export Annotations")).to_be_visible()
    expect(page.get_by_role("combobox", name="Export")).to_be_visible()
    expect(page.get_by_role("button", name="Export", exact=True)).to_be_visible()
    page.get_by_role("button", name="Export Annotations").click()
    expect(page.get_by_role("group", name="Export Annotations")).to_be_hidden()

    expect(page.get_by_role("button", name="Import Annotations")).to_be_visible()
    page.get_by_role("button", name="Import Annotations").click()
    expect(page.get_by_role("group", name="Import Annotations")).to_be_visible()
    expect(page.get_by_role("button", name="Import", exact=True)).to_be_visible()
    page.get_by_role("button", name="Import Annotations").click()
    expect(page.get_by_role("group", name="Import Annotations")).to_be_hidden()


@pytest.mark.parametrize("data_loader", ["parquet", "uda"])
def test_timeseries_navigation(data_loader, request, server_setup, page: Page):
    # Create Project
    project_id = create_project("Test Project", "time-series", data_loader)
    # And a sample for time-series
    if data_loader == "uda":
        request.getfixturevalue("uda_test")
        ids = create_uda_samples(project_id, [10000], ["Ip"])
    else:
        ids = create_local_samples(
            project_id, [10000], pathlib.Path(__file__).parents[1], ["Ip"]
        )

    sample_id = ids[0]

    # Navigate to Samples page
    page.goto(f"http://localhost:8002/ui/projects/{project_id}")

    # Click on sample
    page.get_by_role("rowheader", name="10000").click()

    # Check I've navigated to the correct page
    expect(page).to_have_url(
        f"http://localhost:8002/ui/projects/{project_id}/samples/{sample_id}",
        timeout=3000,
    )

    # Check basic structure of page is correct
    check_base_page(page)

    # Check time series plot rendered
    expect(page.get_by_label("time-series")).to_be_visible()

    # Check Ip trace rendered
    expect(page.get_by_text("Ip", exact=True)).to_be_visible()

    # Check Annotations table rendered
    expect(page.get_by_role("columnheader", name="Category")).to_be_visible()
    expect(page.get_by_role("columnheader", name="Type")).to_be_visible()
    expect(page.get_by_role("columnheader", name="x0")).to_be_visible()
    expect(page.get_by_role("columnheader", name="x1")).to_be_visible()

    # Check Toolbox rendered
    expect(page.get_by_text("Toolbox")).to_be_visible()

    # Check toolbox buttons exist, clicking them opens the relevent group, can then be closed
    for tool in (
        "Shot Labels",
        "Peak Detection",
        "Outlier Detection",
        "Change Point Detection",
        "Jump Detection",
    ):
        expect(page.get_by_role("button", name=tool)).to_be_visible()
        page.get_by_role("button", name=tool).click()
        expect(page.get_by_role("group", name=tool)).to_be_visible()
        page.get_by_role("button", name=tool).click()
        expect(page.get_by_role("group", name=tool)).to_be_hidden()


# @pytest.mark.parametrize("img_type", ["png", "jpeg"])
# def test_ufo_navigation(img_type, server_setup, page: Page):
#     # Create Project
#     project_id = create_project("Test Project", "video", "image")

#     ids = create_image_samples(
#         project_id,
#         10000,
#         pathlib.Path(__file__).parents[1].joinpath("mast_images"),
#         img_type,
#     )

#     sample_id = ids[0]

#     # Navigate to Samples page
#     page.goto(f"http://localhost:8002/ui/projects/{project_id}")

#     # Click on sample
#     page.get_by_role("rowheader", name="10000").click()

#     # Check I've navigated to the correct page
#     expect(page).to_have_url(
#         f"http://localhost:8002/ui/projects/{project_id}/samples/{sample_id}",
#         timeout=3000,
#     )

#     # Check basic structure of page is correct
#     check_base_page(page)

#     # Check frame navigation present
#     expect(page.get_by_role("searchbox", name="Jump to Frame")).to_be_visible()
#     expect(page.get_by_text("Frame: 1")).to_be_visible()

#     # Check image displayed
#     expect(page.get_by_role("img")).to_be_visible()


@pytest.mark.parametrize("data_loader", ["parquet", "uda"])
def test_search_for_shot(request, data_loader, server_setup, page: Page):
    # Create Project
    project_id = create_project("Test Project", "time-series", data_loader)
    # And a sample for time-series
    if data_loader == "uda":
        request.getfixturevalue("uda_test")
        shot_10000_id = create_uda_samples(project_id, [10000], ["Ip"])[0]
        shot_10001_id = create_uda_samples(project_id, [10001], ["Ip"])[0]
    else:
        shot_10000_id = create_local_samples(
            project_id, [10000], pathlib.Path(__file__).parents[1], ["Ip"]
        )[0]
        shot_10001_id = create_local_samples(
            project_id, [10001], pathlib.Path(__file__).parents[1]
        )[0]

    # Navigate to Samples page
    page.goto(f"http://localhost:8002/ui/projects/{project_id}")

    # Click on sample
    page.get_by_role("rowheader", name="10000").click()

    # Check I've navigated to the correct page
    expect(page).to_have_url(
        f"http://localhost:8002/ui/projects/{project_id}/samples/{shot_10000_id}",
        timeout=3000,
    )

    # Check basic structure of page is correct
    check_base_page(page)

    # Search by shot - go to 10001
    searchbox = page.get_by_role("searchbox", name="Jump to Shot")

    # Search for sample 10001
    searchbox.fill("10001")
    searchbox.press("Enter")

    # Check I've navigated to new page
    expect(page).to_have_url(
        f"http://localhost:8002/ui/projects/{project_id}/samples/{shot_10001_id}",
        timeout=3000,
    )

    # Check basic structure of page is correct
    check_base_page(page)

    # Try to navigate to non existent shot
    searchbox.fill("10002")
    searchbox.press("Enter")

    # Check I've not been moved off of the current page
    expect(page).to_have_url(
        f"http://localhost:8002/ui/projects/{project_id}/samples/{shot_10001_id}",
        timeout=3000,
    )
    # Check error message shown
    expect(page.get_by_text("Shot not found!")).to_be_visible()


# TODO: Test Next button with each query strategy
# TODO:
