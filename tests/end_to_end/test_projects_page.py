import requests
from playwright.sync_api import Page, expect
import re
from datetime import datetime
import time


def create_project(name: str, task: str, data_loader: str) -> str:
    project = {
        "name": name,
        "task": task,
        "query_strategy": "random",
        "data_loader": data_loader,
    }

    response = requests.post(
        "http://localhost:8002/projects",
        json=project,
    )
    assert response.status_code == 200

    project_id = response.json()["_id"]
    return project_id


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


def test_page_navigation(server_setup, page: Page):
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


def test_sorting(server_setup, page: Page):
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


def test_search(server_setup, page: Page):
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
