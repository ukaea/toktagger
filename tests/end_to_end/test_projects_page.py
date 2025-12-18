import requests
from playwright.sync_api import Page, expect
import re
from datetime import datetime
import time
import tempfile
import pathlib
from tests.endpoints import create_project


def check_base_page(page):
    # Expect page is called TokTagger
    expect(page).to_have_title("TokTagger")

    # Expect breadcrumbs at the top to be visible, and showing Projects link
    expect(page.get_by_role("link", name="Projects")).to_be_visible()

    # Expect table to have heading 'Projects'
    expect(page.get_by_role("heading", name="Projects")).to_be_visible()

    # Expect all table headings visible
    expect(page.get_by_role("columnheader", name="Name")).to_be_visible()
    expect(page.get_by_role("columnheader", name="Task")).to_be_visible()
    expect(page.get_by_role("columnheader", name="Date Created")).to_be_visible()
    expect(page.get_by_role("columnheader", name="Loader")).to_be_visible()
    expect(page.get_by_role("columnheader", name="Edit")).to_be_visible()

    # Expect Create button visible
    expect(page.get_by_role("button", name="Create")).to_be_visible()

    # Expect searchbar visible
    expect(page.get_by_role("searchbox", name="Search By Name")).to_be_visible()

    # Expect page navigation to be visible
    expect(page.get_by_role("button", name="Previous")).to_be_visible()
    expect(page.get_by_role("button", name="Next")).to_be_visible()
    expect(page.get_by_role("button", name="Projects per Page:")).to_be_visible()

    # Expect to be on page 1
    expect(page.get_by_text("Page: 1")).to_be_visible()


def check_create_modal(page):
    # Press create button
    page.get_by_role("button", name="Create").click()

    # Check modal has opened
    modal = page.get_by_role("dialog")
    expect(modal).to_be_visible()

    # Check it appears as expected
    expect(modal.get_by_role("heading", name="Create Project")).to_be_visible()
    expect(modal.get_by_role("button", name="Create")).to_be_visible()
    expect(modal.get_by_role("button", name="Close")).to_be_visible()
    # Check form contains required fields
    expect(modal.get_by_text("Project Name")).to_be_visible()
    expect(modal.get_by_text("Data Loader")).to_be_visible()
    expect(modal.get_by_text("Task")).to_be_visible()
    expect(modal.get_by_text("Query Strategy")).to_be_visible()

    # Fill in common info
    modal.get_by_role("button", name="Task").click()
    page.get_by_role("option", name="disruption").click()
    modal.get_by_role("radio", name="Random").click()
    modal.get_by_role("textbox", name="Project Name").fill("Test Project")

    return modal


def test_empty_projects_table(server_setup, page: Page):
    # Navigate to page
    page.goto("http://localhost:8002")

    # Check basic structure of page is correct
    check_base_page(page)

    # Expect Edit and Delete buttons NOT visible since no projects in table
    expect(page.get_by_role("button", name="Edit")).to_be_hidden()
    expect(page.get_by_role("button", name="Delete")).to_be_hidden()

    # Expect next and previous buttons to be disabled
    expect(page.get_by_role("button", name="Previous")).to_be_disabled()
    expect(page.get_by_role("button", name="Next")).to_be_disabled()


def test_single_project(server_setup, page: Page):
    # Create a project
    project_id = create_project("Test Project", "disruption", "uda")

    # Navigate to page
    page.goto("http://localhost:8002")

    # Check basic structure of page is correct
    check_base_page(page)

    # Expect Edit and Delete buttons visible
    expect(page.get_by_role("button", name="Edit")).to_be_visible()
    expect(page.get_by_role("button", name="Delete")).to_be_visible()

    # Expect next and previous buttons to be disabled
    expect(page.get_by_role("button", name="Previous")).to_be_disabled()
    expect(page.get_by_role("button", name="Next")).to_be_disabled()

    # Check project information is shown
    expect(page.get_by_text("Test Project")).to_be_visible()
    expect(page.get_by_text("disruption")).to_be_visible()
    expect(page.get_by_text("uda")).to_be_visible()
    expect(page.get_by_text(re.compile(f"^{datetime.now().date()}*"))).to_be_visible()

    # Expect that I can click on the row in the table and it takes me to a sample page
    table_row = page.get_by_role("rowheader", name="Test Project")
    expect(table_row).to_be_visible()
    expect(table_row).to_be_enabled()

    # Try clicking the row
    table_row.click()
    expect(page).to_have_url(
        f"http://localhost:8002/ui/projects/{project_id}", timeout=3
    )


def test_projects_page_navigation(server_setup, page: Page):
    # Create 6 projects
    for i in range(1, 7):
        create_project(f"Test Project {i}", "disruption", "uda")

    # Navigate to page
    page.goto("http://localhost:8002")

    # Check basic structure of page is correct
    check_base_page(page)

    # Expect next and previous buttons to be disabled since by default shows 10 projects
    expect(page.get_by_role("button", name="Previous")).to_be_disabled()
    expect(page.get_by_role("button", name="Next")).to_be_disabled()

    # Check all projects available
    expect(page.get_by_text("Test Project 1")).to_be_visible()
    expect(page.get_by_text("Test Project 6")).to_be_visible()

    # Try clicking Projects per Page dropdown
    page.get_by_role("button", name="Projects per Page:").click()
    page.get_by_role("option", name="5", exact=True).click()

    # By default the projects appear newest first, so first project shouldn't be on list
    expect(page.get_by_text("Test Project 6")).to_be_visible()
    expect(page.get_by_text("Test Project 1")).to_be_hidden()

    # Previous button should still be disabled, next button should be enabled
    expect(page.get_by_role("button", name="Previous")).to_be_disabled()
    expect(page.get_by_role("button", name="Next")).to_be_enabled()

    # Try pressing Next button
    page.get_by_role("button", name="Next").click()
    expect(page.get_by_text("Page: 2")).to_be_visible()

    # Check project 1 is visible, project 2 is not
    expect(page.get_by_text("Test Project 1")).to_be_visible()
    expect(page.get_by_text("Test Project 2")).to_be_hidden()

    # Check Previous button enabled, Next button is not
    expect(page.get_by_role("button", name="Previous")).to_be_enabled()
    expect(page.get_by_role("button", name="Next")).to_be_disabled()

    # Press previous, check we go back to before
    page.get_by_role("button", name="Previous").click()
    expect(page.get_by_text("Page: 1")).to_be_visible()

    expect(page.get_by_text("Test Project 6")).to_be_visible()
    expect(page.get_by_text("Test Project 1")).to_be_hidden()

    # Press Next
    page.get_by_role("button", name="Next").click()
    expect(page.get_by_text("Page: 2")).to_be_visible()

    # Now change projects per page back to 10, check we are sent back to page 1
    page.get_by_role("button", name="Projects per Page:").click()
    page.get_by_role("option", name="10", exact=True).click()

    # Should be back to page 1 with all projects visible
    expect(page.get_by_text("Page: 1")).to_be_visible()
    expect(page.get_by_text("Test Project 1")).to_be_visible()
    expect(page.get_by_text("Test Project 6")).to_be_visible()

    # And both buttons disabled
    expect(page.get_by_role("button", name="Previous")).to_be_disabled()
    expect(page.get_by_role("button", name="Next")).to_be_disabled()


def test_projects_sorting(server_setup, page: Page):
    def sort(page, col_name, expected_first, expected_second):
        # Sort by given column
        page.get_by_role("columnheader", name=col_name).click()

        # Check projects in correct order
        expect(page.get_by_role("row").nth(1)).to_contain_text(expected_first)
        expect(page.get_by_role("row").nth(2)).to_contain_text(expected_second)

        # Click again, sort in opposite direction
        page.get_by_role("columnheader", name=col_name).click()

        # PCheck projects in reverse direction
        expect(page.get_by_role("row").nth(1)).to_contain_text(expected_second)
        expect(page.get_by_role("row").nth(2)).to_contain_text(expected_first)

    # Create some projects
    create_project("A Project", "ELM", "uda")
    time.sleep(0.1)
    create_project("B Project", "MHD", "parquet")

    # Navigate to page
    page.goto("http://localhost:8002")

    # Check basic structure of page is correct
    check_base_page(page)

    # Sort by Name: A should be first, then B
    sort(page, "Name", "A Project", "B Project")

    # Sort by Task, A should be first (ELM), then B (MHD)
    sort(page, "Task", "A Project", "B Project")

    # Sort by Timestamp, A should be first (oldest - so lowest timestamp), then B (newest - highest timestamp)
    sort(page, "Date Created", "A Project", "B Project")

    # Sort by Loader, B should be first (parquet), then A (uda)
    sort(page, "Loader", "B Project", "A Project")


def test_projects_search(server_setup, page: Page):
    # Create some projects with different names
    create_project("Project A", "ELM", "uda")
    create_project("Project B", "ELM", "uda")
    create_project("project C", "ELM", "uda")
    create_project("Test Project", "ELM", "uda")
    create_project("Projection", "ELM", "uda")
    create_project("New UDA ELMs", "ELM", "uda")

    # Navigate to page
    page.goto("http://localhost:8002")

    # Check basic structure of page is correct
    check_base_page(page)

    searchbox = page.get_by_role("searchbox", name="Search By Name")

    # Search for Project 1
    searchbox.fill("Project A")
    searchbox.press("Enter")

    # Check there is only one row
    expect(page.get_by_role("row").nth(1)).to_contain_text("Project A")
    expect(page.get_by_role("row").nth(2)).to_be_hidden()

    # Search for project
    searchbox.fill("project")
    searchbox.press("Enter")

    # Search should be case insensitive, find any entries which contain that phrase
    # So 5 projects, not 'New UDA Elms'
    # In newest first order
    expect(page.get_by_role("row").nth(1)).to_contain_text("Projection")
    expect(page.get_by_role("row").nth(2)).to_contain_text("Test Project")
    expect(page.get_by_role("row").nth(3)).to_contain_text("project C")
    expect(page.get_by_role("row").nth(4)).to_contain_text("Project B")
    expect(page.get_by_role("row").nth(5)).to_contain_text("Project A")
    expect(page.get_by_role("row").nth(6)).to_be_hidden()

    # Search for 'Project ', with a space
    searchbox.fill("Project ")
    searchbox.press("Enter")

    # Should find Project A, Project B, Project C
    expect(page.get_by_role("row").nth(1)).to_contain_text("project C")
    expect(page.get_by_role("row").nth(2)).to_contain_text("Project B")
    expect(page.get_by_role("row").nth(3)).to_contain_text("Project A")
    expect(page.get_by_role("row").nth(4)).to_be_hidden()

    # Search for 'wrong'
    searchbox.fill("wrong")
    searchbox.press("Enter")

    # Should find nothing
    expect(page.get_by_role("row").nth(1)).to_be_hidden()

    # Enter blank string (delete search)
    searchbox.fill("")
    searchbox.press("Enter")

    # Should find all 6 entries
    expect(page.get_by_role("row").nth(6)).to_contain_text("Project A")
    expect(page.get_by_role("row").nth(7)).to_be_hidden()


def test_delete_project(server_setup, page: Page):
    # Create some projects
    create_project("Project A", "ELM", "uda")
    create_project("Project B", "disruption", "parquet")

    # Navigate to page
    page.goto("http://localhost:8002")

    # Check basic structure of page is correct
    check_base_page(page)

    # Press delete next to project B
    page.get_by_role("row").nth(1).get_by_role("button", name="Delete").click()

    # Check row 1 is now Project A, and it is the only row
    expect(page.get_by_role("row").nth(1)).to_contain_text("Project A")
    expect(page.get_by_role("row").nth(2)).to_be_hidden()

    # Now delete project A
    page.get_by_role("row").nth(1).get_by_role("button", name="Delete").click()

    # Check no projects remain
    expect(page.get_by_role("row").nth(1)).to_be_hidden()


def test_edit_project(server_setup, page: Page):
    # Create some projects
    create_project("Test Project", "ELM", "uda")

    # Navigate to page
    page.goto("http://localhost:8002")

    # Check basic structure of page is correct
    check_base_page(page)

    # Press edit button
    page.get_by_role("row").nth(1).get_by_role("button", name="Edit").click()

    # Modal should have opened
    modal = page.get_by_role("dialog")
    expect(modal).to_be_visible()

    # Check edit project modal has opened
    expect(modal.get_by_role("heading", name="Edit Project")).to_be_visible()
    expect(modal.get_by_role("button", name="Edit")).to_be_visible()
    expect(modal.get_by_role("button", name="Close")).to_be_visible()

    # Check you can edit project name and query strategy
    expect(modal.get_by_text("Project Name")).to_be_visible()
    expect(modal.get_by_text("Query Strategy")).to_be_visible()

    # Edit the project name
    modal.get_by_role("textbox", name="Project Name").fill("Updated Project")

    # Change the query strategy
    modal.get_by_role("radio", name="Sequential").click()

    # Save changes
    modal.get_by_role("button", name="Edit").click()

    # Check modal has closed
    check_base_page(page)

    # Check project name updated
    expect(page.get_by_role("row").nth(1)).to_contain_text("Updated Project")

    # Get back project from server to check it updated
    response = requests.get("http://localhost:8002/projects")
    project = response.json()[0]
    assert project["name"] == "Updated Project"
    assert project["query_strategy"] == "sequential"
    assert project["task"] == "ELM"
    assert project["data_loader"] == "uda"


def test_create_project_shot_data(server_setup, page: Page):
    # Navigate to page
    page.goto("http://localhost:8002")

    # Check basic structure of page is correct
    check_base_page(page)

    modal = check_create_modal(page)

    # Select UDA data loader - should open ShotData form
    modal.get_by_role("button", name="Data Loader").click()
    page.get_by_role("option", name="UDA").click()

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

    # Create project
    modal.get_by_role("button", name="Create").click()

    # Check project added to table
    expect(page.get_by_role("row").nth(1)).to_contain_text("Test Project")

    # Get project from API, check details are all correct
    response = requests.get("http://localhost:8002/projects")
    project = response.json()[0]
    assert project["name"] == "Test Project"
    assert project["query_strategy"] == "random"
    assert project["task"] == "disruption"
    assert project["data_loader"] == "uda"

    # Check 6 samples added (12380 to 12385 inclusive)
    response = requests.get(f"http://localhost:8002/projects/{project['_id']}/samples")
    samples = response.json()
    assert len(samples) == 6
    assert all(sample["data"]["signal_names"][0] == "ip" for sample in samples)


def test_create_project_file_data(server_setup, page: Page):
    # Navigate to page
    page.goto("http://localhost:8002")

    # Check basic structure of page is correct
    check_base_page(page)

    modal = check_create_modal(page)

    # Create some Parquet files
    with tempfile.TemporaryDirectory() as tempd:
        pathlib.Path(tempd).joinpath("10000.parquet").touch()
        pathlib.Path(tempd).joinpath("10001.parquet").touch()

        # Select Local File data loader - should open FileData form
        modal.get_by_role("button", name="Data Loader").click()
        page.get_by_role("option", name="parquet").click()

        # Check we can now see File Type, File Path, and File Columns visible
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
        expect(page.get_by_role("row").nth(1)).to_contain_text("Test Project")

        # Get project from API, check details are all correct
        response = requests.get("http://localhost:8002/projects")
        project = response.json()[0]
        assert project["name"] == "Test Project"
        assert project["query_strategy"] == "random"
        assert project["task"] == "disruption"
        assert project["data_loader"] == "parquet"

        # Check 2 samples added (10000 and 10001)
        response = requests.get(
            f"http://localhost:8002/projects/{project['_id']}/samples"
        )
        samples = response.json()
        assert len(samples) == 2
        assert all(sample["data"]["column_names"][0] == "ip" for sample in samples)
        assert sorted(sample["shot_id"] for sample in samples) == [10000, 10001]
