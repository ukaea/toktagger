from playwright.sync_api import Page, expect
import re
from datetime import datetime
import pathlib
from tests.endpoints import create_project, create_local_samples, create_uda_samples
import time
import requests
import tempfile


def check_base_page(page):
    # Expect page is called TokTagger
    expect(page).to_have_title("TokTagger")

    # Expect breadcrumbs at the top to be visible, and showing Projects link
    expect(page.get_by_role("link", name="Projects")).to_be_visible()

    # Expect table to have heading 'Samples'
    expect(page.get_by_role("heading", name="Samples")).to_be_visible()

    # Expect all table headings visible
    expect(page.get_by_role("columnheader", name="Shot ID")).to_be_visible()
    expect(page.get_by_role("columnheader", name="Date Created")).to_be_visible()

    # Expect Create button visible
    expect(page.get_by_role("button", name="Create")).to_be_visible()

    # Expect searchbar visible
    expect(page.get_by_role("searchbox", name="Search By Shot ID")).to_be_visible()

    # Expect page navigation to be visible
    expect(page.get_by_role("button", name="Previous")).to_be_visible()
    expect(page.get_by_role("button", name="Next")).to_be_visible()
    expect(page.get_by_role("button", name="Samples per Page:")).to_be_visible()

    # Expect to be on page 1
    expect(page.get_by_text("Page: 1")).to_be_visible()


def test_empty_samples_table(server_setup, page: Page):
    # Create Project
    project_id = create_project("Test Project", "disruption", "parquet")

    # Navigate to page
    page.goto(f"http://localhost:8002/ui/projects/{project_id}")

    # Check basic structure of page is correct
    check_base_page(page)

    # Expect next and previous buttons to be disabled
    expect(page.get_by_role("button", name="Previous")).to_be_disabled()
    expect(page.get_by_role("button", name="Next")).to_be_disabled()

    # Check we can navigate back to Projects page via breadcrumbs
    page.get_by_role("link", name="Projects").click()
    expect(page).to_have_url("http://localhost:8002/ui/projects", timeout=3)


def test_single_sample(server_setup, page: Page):
    # Create a project
    project_id = create_project("Test Project", "disruption", "parquet")
    # And a sample
    ids = create_local_samples(
        project_id, [10000], pathlib.Path(__file__).parents[1], ["Ip"]
    )
    sample_id = ids[0]

    # Navigate to page
    page.goto(f"http://localhost:8002/ui/projects/{project_id}")

    # Check basic structure of page is correct
    check_base_page(page)

    # Expect next and previous buttons to be disabled
    expect(page.get_by_role("button", name="Previous")).to_be_disabled()
    expect(page.get_by_role("button", name="Next")).to_be_disabled()

    # Check sample information is shown
    expect(page.get_by_text("10000")).to_be_visible()
    expect(page.get_by_text(re.compile(f"^{datetime.now().date()}*"))).to_be_visible()

    # Expect that I can click on the row in the table and it takes me to a ELM view page
    table_row = page.get_by_role("rowheader", name="10000")
    expect(table_row).to_be_visible()
    expect(table_row).to_be_enabled()

    # Try clicking the row
    table_row.click()
    expect(page).to_have_url(
        f"http://localhost:8002/ui/projects/{project_id}/samples/{sample_id}", timeout=3
    )


def test_sample_page_navigation(server_setup, page: Page):
    # Create a project
    project_id = create_project("Test Project", "disruption", "uda")
    # And 6 samples
    create_uda_samples(project_id, shot_ids=list(range(10001, 10007)))

    # Navigate to page
    page.goto(f"http://localhost:8002/ui/projects/{project_id}")

    # Check basic structure of page is correct
    check_base_page(page)

    # Expect next and previous buttons to be disabled since by default shows 10 samples
    expect(page.get_by_role("button", name="Previous")).to_be_disabled()
    expect(page.get_by_role("button", name="Next")).to_be_disabled()

    # Check all samples available
    expect(page.get_by_text("10001")).to_be_visible()
    expect(page.get_by_text("10006")).to_be_visible()

    # Try clicking Samples per Page dropdown
    page.get_by_role("button", name="Samples per Page:").click()
    page.get_by_role("option", name="5", exact=True).click()

    # By default the samples appear shot ID low to high, so 10006 shoidnt be on list
    expect(page.get_by_text("10001")).to_be_visible()
    expect(page.get_by_text("10006")).to_be_hidden()

    # Previous button should still be disabled, next button should be enabled
    expect(page.get_by_role("button", name="Previous")).to_be_disabled()
    expect(page.get_by_role("button", name="Next")).to_be_enabled()

    # Try pressing Next button
    page.get_by_role("button", name="Next").click()
    expect(page.get_by_text("Page: 2")).to_be_visible()

    # Check sample 10006 is visible, 10005 is not
    expect(page.get_by_text("10006")).to_be_visible()
    expect(page.get_by_text("10005")).to_be_hidden()

    # Check Previous button enabled, Next button is not
    expect(page.get_by_role("button", name="Previous")).to_be_enabled()
    expect(page.get_by_role("button", name="Next")).to_be_disabled()

    # Press previous, check we go back to before
    page.get_by_role("button", name="Previous").click()
    expect(page.get_by_text("Page: 1")).to_be_visible()

    expect(page.get_by_text("10001")).to_be_visible()
    expect(page.get_by_text("10006")).to_be_hidden()

    # Press Next
    page.get_by_role("button", name="Next").click()
    expect(page.get_by_text("Page: 2")).to_be_visible()

    # Now change samples per page back to 10, check we are sent back to page 1
    page.get_by_role("button", name="Samples per Page:").click()
    page.get_by_role("option", name="10", exact=True).click()

    # Should be back to page 1 with all samples visible
    expect(page.get_by_text("Page: 1")).to_be_visible()
    expect(page.get_by_text("10001")).to_be_visible()
    expect(page.get_by_text("10006")).to_be_visible()

    # And both buttons disabled
    expect(page.get_by_role("button", name="Previous")).to_be_disabled()
    expect(page.get_by_role("button", name="Next")).to_be_disabled()


def test_samples_sorting(server_setup, page: Page):
    def sort(page, col_name, expected_first, expected_second):
        # Sort by given column
        page.get_by_role("columnheader", name=col_name).click()

        # Check samples in correct order
        expect(page.get_by_role("row").nth(1)).to_contain_text(expected_first)
        expect(page.get_by_role("row").nth(2)).to_contain_text(expected_second)

        # Click again, sort in opposite direction
        page.get_by_role("columnheader", name=col_name).click()

        # PCheck samples in reverse direction
        expect(page.get_by_role("row").nth(1)).to_contain_text(expected_second)
        expect(page.get_by_role("row").nth(2)).to_contain_text(expected_first)

    # Create a project
    project_id = create_project("Test Project", "disruption", "uda")
    # And 2 samples
    create_uda_samples(project_id, shot_ids=[20000])
    time.sleep(0.1)

    create_uda_samples(project_id, shot_ids=[10000])
    # Navigate to page
    page.goto(f"http://localhost:8002/ui/projects/{project_id}")

    # Check basic structure of page is correct
    check_base_page(page)

    # Sort by Timestamp, 20000 should be first (oldest - so lowest timestamp), then 10000 (newest - highest timestamp)
    sort(page, "Date Created", "20000", "10000")

    # Sort by Shot ID, 10000 should be first, then 20000
    sort(page, "Shot ID", "10000", "20000")


def test_samples_search(server_setup, page: Page):
    # Create a project
    project_id = create_project("Test Project", "disruption", "uda")
    # And 6 samples
    create_uda_samples(project_id, shot_ids=list(range(10001, 10007)))

    # Navigate to page
    page.goto(f"http://localhost:8002/ui/projects/{project_id}")

    # Check basic structure of page is correct
    check_base_page(page)

    searchbox = page.get_by_role("searchbox", name="Search By Shot ID")

    # Search for sample 10001
    searchbox.fill("10001")
    searchbox.press("Enter")

    # Check there is only one row
    expect(page.get_by_role("row").nth(1)).to_contain_text("10001")
    expect(page.get_by_role("row").nth(2)).to_be_hidden()

    # Search for sample 10006
    searchbox.fill("10006")
    searchbox.press("Enter")

    # Check there is only one row
    expect(page.get_by_role("row").nth(1)).to_contain_text("10006")
    expect(page.get_by_role("row").nth(2)).to_be_hidden()

    # Search for '100' - this search is not regex, so this should return nothing
    searchbox.fill("100")
    searchbox.press("Enter")

    # Check there are no results
    expect(page.get_by_role("row").nth(1)).to_be_hidden()

    # Enter blank string (delete search)
    searchbox.fill("")
    searchbox.press("Enter")

    # Should find all 6 entries
    expect(page.get_by_role("row").nth(6)).to_contain_text("10006")
    expect(page.get_by_role("row").nth(7)).to_be_hidden()


def test_create_samples_shot_data(server_setup, page: Page):
    # Create a project
    project_id = create_project("Test Project", "disruption", "uda")

    # Navigate to page
    page.goto(f"http://localhost:8002/ui/projects/{project_id}")

    # Check basic structure of page is correct
    check_base_page(page)

    # Press create button
    page.get_by_role("button", name="Create").click()

    # Check modal has opened
    modal = page.get_by_role("dialog")
    expect(modal).to_be_visible()
    expect(modal.get_by_role("heading", name="Add Samples")).to_be_visible()

    # Check we can now see Shot Min, Shot Max, and UDA Signal Names
    expect(modal.get_by_text("Shot Min", exact=True)).to_be_visible()
    expect(modal.get_by_text("Shot Max", exact=True)).to_be_visible()
    expect(modal.get_by_text("Signal Names")).to_be_visible()

    # Fill in these fields
    modal.get_by_role("textbox", name="Shot Min").fill("12380")
    modal.get_by_role("textbox", name="Shot Max").fill("12385")

    # Add signal name
    modal.get_by_role("textbox", name="Signal Names").fill("ANE_DENSITY")
    modal.get_by_role("button", name="Add").click()
    expect(modal.get_by_text("ANE_DENSITY")).to_be_visible()

    # Check it can be removed
    modal.get_by_role("button", name="Remove").click()
    expect(modal.get_by_text("ANE_DENSITY")).to_be_hidden()

    # Add another signal name
    modal.get_by_role("textbox", name="Signal Names").fill("ip")
    modal.get_by_role("button", name="Add").click()
    expect(modal.get_by_text("ip")).to_be_visible()

    # Create samples
    modal.get_by_role("button", name="Create").click()

    # Check samples added to table
    expect(page.get_by_role("row").nth(1)).to_contain_text("12380")
    expect(page.get_by_role("row").nth(6)).to_contain_text("12385")

    # Check 6 samples added (12380 to 12385 inclusive)
    response = requests.get(f"http://localhost:8002/projects/{project_id}/samples")
    samples = response.json()
    assert len(samples) == 6
    assert all(sample["data"]["signal_names"][0] == "ip" for sample in samples)


def test_create_samples_file_data(server_setup, page: Page):
    # Create a project
    project_id = create_project("Test Project", "disruption", "parquet")

    # Navigate to page
    page.goto(f"http://localhost:8002/ui/projects/{project_id}")

    # Check basic structure of page is correct
    check_base_page(page)

    # Press create button
    page.get_by_role("button", name="Create").click()

    # Check modal has opened
    modal = page.get_by_role("dialog")
    expect(modal).to_be_visible()
    expect(modal.get_by_role("heading", name="Add Samples")).to_be_visible()

    # Create some Parquet files
    with tempfile.TemporaryDirectory() as tempd:
        pathlib.Path(tempd).joinpath("10000.parquet").touch()
        pathlib.Path(tempd).joinpath("10001.parquet").touch()

        # Check we can see File Type, File Path, and File Columns visible
        expect(modal.get_by_text("File Type")).to_be_visible()
        expect(modal.get_by_text("File Path")).to_be_visible()
        expect(modal.get_by_text("File Columns")).to_be_visible()

        # Add temp dir as file path, check 2 files are found
        modal.get_by_role("textbox", name="File Path").fill(tempd)
        expect(modal.get_by_text("2 parquet files found.")).to_be_visible()

        # Add column name
        modal.get_by_role("textbox", name="File Columns").fill("ANE_DENSITY")
        modal.get_by_role("button", name="Add").click()
        expect(modal.get_by_text("ANE_DENSITY")).to_be_visible()

        # Check it can be removed
        modal.get_by_role("button", name="Remove").click()
        expect(modal.get_by_text("ANE_DENSITY")).to_be_hidden()

        # Add another column name
        modal.get_by_role("textbox", name="File Columns").fill("ip")
        modal.get_by_role("button", name="Add").click()
        expect(modal.get_by_text("ip")).to_be_visible()

        # Create project
        modal.get_by_role("button", name="Create").click()

        # Check project added to table
        expect(page.get_by_role("row").nth(1)).to_contain_text("10000")
        expect(page.get_by_role("row").nth(2)).to_contain_text("10001")

        # Check 2 samples added (10000 and 10001)
        response = requests.get(f"http://localhost:8002/projects/{project_id}/samples")
        samples = response.json()
        assert len(samples) == 2
        assert all(sample["data"]["column_names"][0] == "ip" for sample in samples)
        assert sorted(sample["shot_id"] for sample in samples) == [10000, 10001]
