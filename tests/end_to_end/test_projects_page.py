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
        time.sleep(0.1)

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
