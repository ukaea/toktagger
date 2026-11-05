import pytest
from fastmcp.exceptions import ToolError
from toktagger.api.routers.mcp import INSTRUCTIONS


@pytest.mark.asyncio
async def test_expected_tools(mcp_client):
    """Every MCP tagged endpoint should be exposed as a tool, and nothing else."""
    tools = await mcp_client.list_tools()
    names = {tool.name for tool in tools}
    assert sorted(names) == [
        "add_samples",
        "create_automated_sample_annotations",
        "create_model_predictions",
        "create_project",
        "create_sample_model_predictions",
        "get_annotator_types",
        "get_data_schema",
        "get_dataloaders",
        "get_load_model_status",
        "get_model",
        "get_model_load_method_allowlist",
        "get_model_load_methods",
        "get_model_prediction_schema",
        "get_model_training_info",
        "get_model_training_schema",
        "get_model_types",
        "get_next_sample",
        "get_project_annotations",
        "get_projects",
        "get_sample_annotations",
        "get_sample_data_summary",
        "get_sample_model_predictions",
        "get_samples",
        "get_samples_summary",
        "get_trained_models",
        "health_check",
        "import_annotations",
        "load_model_weights_gitlab",
        "load_model_weights_hugging_face",
        "load_model_weights_local",
        "start_model_training",
        "stop_model_training",
        "update_project",
        "update_sample_annotations",
        "update_samples",
    ]

    for tool in [
        "delete_project",
        "delete_all_projects",
        "delete_models",
        "delete_model_predictions",
        "remove_sample",
        "remove_all_samples",
        "delete_all_annotations",
        "delete_sample_annotations",
    ]:
        assert tool not in names


@pytest.mark.asyncio
async def test_tool_descriptions(mcp_client):
    """Tool descriptions should carry the usage guidance from the endpoint docstrings."""
    tools = await mcp_client.list_tools()
    assert len(tools) > 0
    for tool in tools:
        assert tool.description
        assert "Use When" in tool.description
        assert "Do Not Use When" in tool.description
        assert "Example User Requests" in tool.description


@pytest.mark.asyncio
async def test_server_instructions(mcp_client):
    """Top level server instructions should be available to the client."""
    assert mcp_client.server_info.name == "toktagger"

    instructions = mcp_client.instructions
    assert instructions is not None
    assert instructions == INSTRUCTIONS


@pytest.mark.asyncio
async def test_get_projects(mcp_client, setup_db):
    result = await mcp_client.call_tool(
        "get_projects",
    )
    assert result is not None
    projects = result.structured_content.get("result", [])
    assert len(projects) == 3
    assert sorted([project["name"] for project in projects]) == [
        "project_2",
        "test_project_0",
        "test_project_1",
    ]


@pytest.mark.asyncio
async def test_get_projects_filtered(mcp_client, setup_db):
    result = await mcp_client.call_tool("get_projects", arguments={"name": "test"})
    assert result is not None
    projects = result.structured_content.get("result", [])
    assert len(projects) == 2
    assert sorted([project["name"] for project in projects]) == [
        "test_project_0",
        "test_project_1",
    ]


@pytest.mark.asyncio
async def test_post_create_project(mcp_client, setup_db):
    result = await mcp_client.call_tool(
        "create_project",
        arguments={
            "name": "new_project",
            "task": "time-series",
            "query_strategy": "sequential",
            "data_loader": "tabular",
        },
    )
    assert result.is_error is False
    assert result.structured_content["_id"]

    # New project should be visible via the MCP get tool
    result = await mcp_client.call_tool("get_projects")
    projects = result.structured_content.get("result", [])
    assert len(projects) == 4
    assert "new_project" in [project["name"] for project in projects]


@pytest.mark.asyncio
async def test_put_update_project(mcp_client, setup_db):
    result = await mcp_client.call_tool(
        "update_project",
        arguments={
            "project_id": setup_db["project_id_1"],
            "_id": setup_db["project_id_1"],
            "name": "renamed_project",
            "task": "profile-2d",
            "query_strategy": "sequential",
            "data_loader": "uda",
        },
    )
    assert result.is_error is False

    # Rename should be visible via the MCP get tool
    result = await mcp_client.call_tool("get_projects", arguments={"name": "renamed"})
    projects = result.structured_content.get("result", [])
    assert len(projects) == 1
    assert projects[0]["_id"] == setup_db["project_id_1"]


@pytest.mark.asyncio
async def test_post_add_samples(mcp_client, setup_db):
    result = await mcp_client.call_tool(
        "add_samples",
        arguments={
            "project_id": setup_db["project_id_1"],
            "samples": [
                {"shot_id": 10, "data": {"protocol": "uda", "signal_names": ["Ip"]}},
                {"shot_id": 11, "data": {"protocol": "uda", "signal_names": ["Ip"]}},
            ],
        },
    )
    assert result.is_error is False
    assert len(result.structured_content.get("result", [])) == 2

    # New samples should be visible via the MCP get tool
    result = await mcp_client.call_tool(
        "get_samples", arguments={"project_id": setup_db["project_id_1"]}
    )
    samples = result.structured_content.get("result", [])
    assert len(samples) == 4
    assert sorted([sample["shot_id"] for sample in samples]) == [1, 2, 10, 11]


@pytest.mark.asyncio
async def test_put_update_samples(mcp_client, setup_db):
    result = await mcp_client.call_tool(
        "update_samples",
        arguments={
            "project_id": setup_db["project_id_1"],
            "sample_batch": [
                {
                    "_id": setup_db["sample_id_1"],
                    "updates": {"validated_annotations": True},
                }
            ],
        },
    )
    assert result.is_error is False

    # Validation status change should be visible via the MCP get tool
    result = await mcp_client.call_tool(
        "get_samples", arguments={"project_id": setup_db["project_id_1"]}
    )
    samples = {
        sample["shot_id"]: sample
        for sample in result.structured_content.get("result", [])
    }
    assert samples[1]["validated_annotations"] is True
    assert samples[2]["validated_annotations"] is False


@pytest.mark.asyncio
async def test_put_update_sample_annotations(mcp_client, setup_db):
    result = await mcp_client.call_tool(
        "update_sample_annotations",
        arguments={
            "project_id": setup_db["project_id_1"],
            "sample_id": setup_db["sample_id_1"],
            "annotations": [
                {
                    "shot_id": 1,
                    "time_min": 0.5,
                    "time_max": 0.9,
                    "label": "test",
                    "created_by": "manual_annotation",
                    "validated": True,
                }
            ],
        },
    )
    assert result.is_error is False
    # Returns the _id of the new annotation
    assert len(result.structured_content.get("result", [])) == 1

    # Annotations for this sample should have been replaced
    result = await mcp_client.call_tool(
        "get_sample_annotations",
        arguments={
            "project_id": setup_db["project_id_1"],
            "sample_id": setup_db["sample_id_1"],
        },
    )
    annotations = result.structured_content.get("result", [])
    assert len(annotations) == 1
    assert annotations[0]["label"] == "test"
    assert annotations[0]["validated"] is True


@pytest.mark.asyncio
async def test_post_import_annotations(mcp_client, setup_db):
    result = await mcp_client.call_tool(
        "import_annotations",
        arguments={
            "project_id": setup_db["project_id_2"],
            "annotations": [
                {
                    "shot_id": 3,
                    "time_min": 0.1,
                    "time_max": 0.3,
                    "label": "imported",
                    "created_by": "manual_annotation",
                }
            ],
        },
    )
    assert result.is_error is False

    # Project should have its seeded annotation plus the imported one
    result = await mcp_client.call_tool(
        "get_project_annotations",
        arguments={"project_id": setup_db["project_id_2"]},
    )
    annotations = result.structured_content.get("result", [])
    assert len(annotations) == 2
    assert "imported" in [annotation["label"] for annotation in annotations]


@pytest.mark.asyncio
async def test_post_get_sample_data_summary(mcp_client, setup_db):
    result = await mcp_client.call_tool(
        "get_sample_data_summary",
        arguments={
            "project_id": setup_db["project_id_2"],
            "sample_id": setup_db["sample_id_4"],
        },
    )
    assert result.is_error is False
    summary = result.structured_content.get("result", {})
    assert summary["type"] == "time-series"
    assert "Ip" in summary["signals"]


@pytest.mark.asyncio
async def test_post_get_next_sample(mcp_client, setup_db):
    result = await mcp_client.call_tool(
        "get_next_sample",
        arguments={
            "project_id": setup_db["project_id_2"],
            "visited_sample_ids": [],
        },
    )
    assert result.is_error is False
    sample = result.structured_content
    assert sample["shot_id"] in [3, 4]


@pytest.mark.asyncio
async def test_error_for_unknown_project(mcp_client, setup_db):
    """API errors should propagate back through the MCP tool call."""
    with pytest.raises(ToolError, match="HTTP error 404"):
        await mcp_client.call_tool(
            "get_samples",
            arguments={"project_id": "123456789012345678901234"},
        )


@pytest.mark.asyncio
async def test_error_for_unsupported_tool(mcp_client, setup_db):
    """Should not be able to get raw sample data via MCP"""
    with pytest.raises(ToolError, match="Unknown tool"):
        await mcp_client.call_tool(
            "get_sample_data",
            arguments={
                "project_id": setup_db["project_id_1"],
                "sample_id": setup_db["sample_id_1"],
            },
        )
