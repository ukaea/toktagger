import requests
from playwright.sync_api import Page, expect


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


def test_empty_projects_table(start_server, page: Page):
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
