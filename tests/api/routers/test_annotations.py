from typing import get_args

import pytest
from bson.objectid import ObjectId

from toktagger.api.schemas.annotations import AnnotationOutTypes, TimeRegion

from tests import db_definitions


@pytest.mark.parametrize("annotation_schema", get_args(AnnotationOutTypes))
def test_annotation_output_requires_author(annotation_schema):
    author_field = annotation_schema.model_fields["created_by"]
    assert author_field.is_required()
    assert author_field.annotation is str


@pytest.mark.asyncio
async def test_get_all_annotations(api_client, setup_db):
    response = await api_client.get(
        f"/projects/{setup_db['project_id_1']}/samples/{setup_db['sample_id_1']}/annotations?sort_direction=ascending"
    )
    assert response.status_code == 200
    returned_annotations = response.json()
    assert [annotation["_id"] for annotation in returned_annotations] == [
        setup_db["annotation_id_1"],
        setup_db["annotation_id_2"],
        setup_db["annotation_id_3"],
    ]


@pytest.mark.asyncio
async def test_get_all_annotations_sortby(api_client, setup_db):
    response = await api_client.get(
        f"/projects/{setup_db['project_id_1']}/samples/{setup_db['sample_id_1']}/annotations?sort_by=label"
    )
    # Should sort by label
    # So 'annotation' (annotation 1), then 'disruption' (annotation 3) then 'ramp_up' (annotation 2)
    # Default sort direction is descending, so will return the opposite of this: 2, 3, 1
    assert response.status_code == 200
    returned_annotations = response.json()
    assert [annotation["label"] for annotation in returned_annotations] == [
        "ramp_up",
        "disruption",
        "annotation",
    ]
    assert [annotation["_id"] for annotation in returned_annotations] == [
        setup_db["annotation_id_2"],
        setup_db["annotation_id_3"],
        setup_db["annotation_id_1"],
    ]


@pytest.mark.asyncio
async def test_get_annotations_start(api_client, setup_db):
    response = await api_client.get(
        f"/projects/{setup_db['project_id_1']}/samples/{setup_db['sample_id_1']}/annotations?start=1&sort_direction=ascending"
    )
    # Should return 2 annotations
    assert response.status_code == 200
    returned_annotations = response.json()
    assert len(returned_annotations) == 2
    assert [sample["_id"] for sample in returned_annotations] == [
        setup_db["annotation_id_2"],
        setup_db["annotation_id_3"],
    ]


@pytest.mark.asyncio
async def test_get_annotations_count(api_client, setup_db):
    response = await api_client.get(
        f"/projects/{setup_db['project_id_1']}/samples/{setup_db['sample_id_1']}/annotations?count=2&sort_direction=ascending"
    )
    # Should return 2 samples
    assert response.status_code == 200
    returned_annotations = response.json()
    assert len(returned_annotations) == 2
    assert [annotation["_id"] for annotation in returned_annotations] == [
        setup_db["annotation_id_1"],
        setup_db["annotation_id_2"],
    ]


@pytest.mark.asyncio
async def test_get_annotations_start_count(api_client, setup_db):
    response = await api_client.get(
        f"/projects/{setup_db['project_id_1']}/samples/{setup_db['sample_id_1']}/annotations?start=1&count=1&sort_direction=ascending"
    )
    # Should return 1 annotation
    assert response.status_code == 200
    returned_annotations = response.json()
    assert len(returned_annotations) == 1
    assert [annotation["_id"] for annotation in returned_annotations] == [
        setup_db["annotation_id_2"]
    ]


@pytest.mark.asyncio
async def test_get_annotations_invalid_start(api_client, setup_db):
    response = await api_client.get(
        f"/projects/{setup_db['project_id_1']}/samples/{setup_db['sample_id_1']}/annotations?start=10"
    )
    # Should return 0 projects
    assert response.status_code == 200
    returned_annotations = response.json()
    assert len(returned_annotations) == 0


@pytest.mark.asyncio
async def test_get_annotations_validated(api_client, setup_db):
    response = await api_client.get(
        f"/projects/{setup_db['project_id_1']}/samples/{setup_db['sample_id_1']}/annotations?validated=true&sort_direction=ascending"
    )
    # Should return 2 annotations
    assert response.status_code == 200
    returned_annotations = response.json()
    assert len(returned_annotations) == 2
    assert [annotation["_id"] for annotation in returned_annotations] == [
        setup_db["annotation_id_1"],
        setup_db["annotation_id_2"],
    ]
    assert all(annotation["validated"] for annotation in returned_annotations)


@pytest.mark.asyncio
async def test_get_annotations_unvalidated(api_client, setup_db):
    response = await api_client.get(
        f"/projects/{setup_db['project_id_1']}/samples/{setup_db['sample_id_1']}/annotations?validated=false&sort_direction=ascending"
    )
    # Should return 1 annotation
    assert response.status_code == 200
    returned_annotations = response.json()
    assert len(returned_annotations) == 1
    assert returned_annotations[0]["_id"] == setup_db["annotation_id_3"]
    assert not returned_annotations[0]["validated"]


@pytest.mark.asyncio
async def test_get_annotation(api_client, setup_db):
    response = await api_client.get(
        f"/projects/{setup_db['project_id_1']}/samples/{setup_db['sample_id_1']}/annotations?start=1&count=1&sort_direction=ascending"
    )
    assert response.status_code == 200
    returned_annotation = response.json()[0]
    # Check info matches what we created the entry with
    assert returned_annotation.get("time_min") == 0.1
    assert returned_annotation.get("time_max") == 0.2
    assert returned_annotation.get("label") == "ramp_up"
    assert returned_annotation.get("validated")

    # Then also check ID and timestamp are returned - should have been added automatically
    assert returned_annotation.get("_id") == setup_db["annotation_id_2"]
    assert returned_annotation.get("project_id") == setup_db["project_id_1"]
    assert returned_annotation.get("sample_id") == setup_db["sample_id_1"]
    assert returned_annotation.get("timestamp")


@pytest.mark.asyncio
async def test_delete_all_annotations(api_client, setup_db, db_client):
    response = await api_client.delete(
        f"/projects/{setup_db['project_id_1']}/annotations"
    )
    assert response.status_code == 200

    # Check annotations for this project have ALL been deleted
    # But annotations for other samples and projects still exist
    annotations = await db_client.get_all_documents("annotations")
    assert len(annotations) == 1
    assert str(annotations[0]["project_id"]) == setup_db["project_id_2"]

    # Check that sample associated with these annotations has NOT been deleted
    samples = await db_client.get_all_documents("samples")
    assert len(samples) == 4
    # Check sample with above ID is in database
    assert setup_db["sample_id_1"] in [str(sample.get("_id")) for sample in samples]

    # Check that project assocaited with these annotations has NOT been deleted
    projects = await db_client.get_all_documents("projects")
    assert len(projects) == 3
    # Check project with above ID is in database
    assert setup_db["project_id_1"] in [str(project.get("_id")) for project in projects]


@pytest.mark.asyncio
async def test_delete_sample_annotations(api_client, setup_db, db_client):
    response = await api_client.delete(
        f"/projects/{setup_db['project_id_1']}/samples/{setup_db['sample_id_1']}/annotations"
    )
    assert response.status_code == 200

    # Check annotations for this sample have been deleted
    # But annotations for other samples and projects still exist
    annotations = await db_client.get_all_documents("annotations")
    assert len(annotations) == 2
    assert setup_db["sample_id_1"] not in [
        annotation.get("sample_id") for annotation in annotations
    ]

    # Check that sample associated with these annotations has NOT been deleted
    samples = await db_client.get_all_documents("samples")
    assert len(samples) == 4
    # Check sample with above ID is in database
    assert setup_db["sample_id_1"] in [str(sample.get("_id")) for sample in samples]

    # Check that project assocaited with these annotations has NOT been deleted
    projects = await db_client.get_all_documents("projects")
    assert len(projects) == 3
    # Check project with above ID is in database
    assert setup_db["project_id_1"] in [str(project.get("_id")) for project in projects]


@pytest.mark.asyncio
async def test_delete_annotations_bulk(api_client, setup_db, db_client):
    response = await api_client.request(
        "DELETE",
        f"/projects/{setup_db['project_id_1']}/samples/{setup_db['sample_id_1']}/annotations",
        json=[setup_db["annotation_id_1"], setup_db["annotation_id_2"]],
    )
    assert response.status_code == 200
    assert response.json() == 2

    annotations = await db_client.get_all_documents("annotations")
    remaining_ids = {str(annotation["_id"]) for annotation in annotations}
    assert remaining_ids == {
        setup_db["annotation_id_3"],
        setup_db["annotation_id_4"],
        setup_db["annotation_id_5"],
    }


@pytest.mark.asyncio
async def test_delete_annotations_bulk_ignores_unknown_ids(
    api_client, setup_db, db_client
):
    unknown_id = str(ObjectId())
    response = await api_client.request(
        "DELETE",
        f"/projects/{setup_db['project_id_1']}/samples/{setup_db['sample_id_1']}/annotations",
        json=[setup_db["annotation_id_1"], unknown_id],
    )
    assert response.status_code == 200
    # Only the real id is counted; the unknown one is silently ignored, matching
    # the single-annotation delete's tolerance for an id that is already gone.
    assert response.json() == 1

    annotations = await db_client.get_all_documents("annotations")
    remaining_ids = {str(annotation["_id"]) for annotation in annotations}
    assert setup_db["annotation_id_1"] not in remaining_ids
    assert remaining_ids == {
        setup_db["annotation_id_2"],
        setup_db["annotation_id_3"],
        setup_db["annotation_id_4"],
        setup_db["annotation_id_5"],
    }


@pytest.mark.asyncio
async def test_delete_annotations_bulk_empty_list(api_client, setup_db, db_client):
    response = await api_client.request(
        "DELETE",
        f"/projects/{setup_db['project_id_1']}/samples/{setup_db['sample_id_1']}/annotations",
        json=[],
    )
    assert response.status_code == 200
    assert response.json() == 0

    annotations = await db_client.get_all_documents("annotations")
    assert len(annotations) == 5


@pytest.mark.asyncio
async def test_delete_annotations_bulk_scoped_to_sample(
    api_client, setup_db, db_client
):
    # annotation_id_4 belongs to sample_id_2, so naming it while deleting from
    # sample_id_1 must not delete it - the endpoint is scoped by its path, not
    # solely by the ids in the body.
    response = await api_client.request(
        "DELETE",
        f"/projects/{setup_db['project_id_1']}/samples/{setup_db['sample_id_1']}/annotations",
        json=[setup_db["annotation_id_4"]],
    )
    assert response.status_code == 200
    assert response.json() == 0

    annotations = await db_client.get_all_documents("annotations")
    remaining_ids = {str(annotation["_id"]) for annotation in annotations}
    assert setup_db["annotation_id_4"] in remaining_ids


@pytest.mark.asyncio
@pytest.mark.parametrize("validated", [True, False])
async def test_create_annotations(api_client, setup_db, db_client, validated):
    project_id = setup_db["project_id_1"]
    sample_id = setup_db["sample_id_1"]
    path = f"/projects/{project_id}/samples/{sample_id}"
    db_annotations = await db_client.get_filtered_documents(
        "annotations", filters={"sample_id": ObjectId(setup_db["sample_id_1"])}
    )
    payload = TimeRegion(
        label=db_definitions.ANNOTATION_1.label,
        time_min=db_definitions.ANNOTATION_1.time_min,
        time_max=db_definitions.ANNOTATION_1.time_max,
        validated=validated,
    ).model_dump(mode="json")

    response = await api_client.post(f"{path}/annotations", json=[payload])
    assert response.status_code == 200

    db_annotations_new = await db_client.get_filtered_documents(
        "annotations", filters={"sample_id": ObjectId(setup_db["sample_id_1"])}
    )
    assert len(db_annotations_new) == len(db_annotations) + 1

    assert response.status_code == 200
    assert (await api_client.get(path)).json()["validated_annotations"] is validated


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "annotation_key, definition",
    [
        ("annotation_id_1", db_definitions.ANNOTATION_1),
        ("annotation_id_3", db_definitions.ANNOTATION_3),
    ],
)
async def test_get_single_annotation(api_client, setup_db, annotation_key, definition):
    project_id = setup_db["project_id_1"]
    sample_id = setup_db["sample_id_1"]

    response = await api_client.get(
        f"/projects/{project_id}/samples/{sample_id}/annotations/{setup_db[annotation_key]}"
    )

    assert response.status_code == 200
    annotation = response.json()
    assert annotation["_id"] == setup_db[annotation_key]
    assert annotation["project_id"] == project_id
    assert annotation["sample_id"] == sample_id
    assert annotation["type"] == definition.type
    assert annotation["label"] == definition.label
    assert annotation["created_by"] == definition.created_by
    assert annotation["created_by_name"] == definition.created_by
    assert annotation["shot_id"] == definition.shot_id


@pytest.mark.asyncio
async def test_get_single_annotation_invalid_id(api_client, setup_db):
    response = await api_client.get(
        f"/projects/{setup_db['project_id_1']}/samples/{setup_db['sample_id_1']}/annotations/invalid"
    )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_update_single_annotation(api_client, setup_db):
    project_id = setup_db["project_id_1"]
    sample_id = setup_db["sample_id_1"]
    annotation_id = setup_db["annotation_id_1"]
    path = f"/projects/{project_id}/samples/{sample_id}/annotations"
    existing = (await api_client.get(path)).json()
    original = next(
        annotation for annotation in existing if annotation["_id"] == annotation_id
    )

    response = await api_client.put(
        f"{path}/{annotation_id}",
        json={
            "type": "time_region",
            "label": "corrected",
            "time_min": 0.5,
            "time_max": 0.6,
            "validated": True,
            "created_by": "spoofed",
            "_id": setup_db["annotation_id_2"],
            "shot_id": 999,
        },
    )

    assert response.status_code == 200
    assert response.json() is None
    fetched = await api_client.get(f"{path}/{annotation_id}")
    assert fetched.status_code == 200
    updated = fetched.json()
    assert updated["_id"] == annotation_id
    assert updated["created_by"] == original["created_by"]
    assert updated["timestamp"] == original["timestamp"]
    assert updated["shot_id"] == original["shot_id"]
    assert updated["project_id"] == project_id
    assert updated["sample_id"] == sample_id
    assert updated["label"] == "corrected"
    assert updated["time_min"] == 0.5
    assert updated["uncertainty"] == 0
    stored = (await api_client.get(path)).json()
    assert len(stored) == len(existing)
    assert all(
        annotation in stored
        for annotation in existing
        if annotation["_id"] != annotation_id
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("method", ["GET", "PUT"])
@pytest.mark.parametrize(
    "target",
    ["missing", "wrong_sample", "wrong_project", "missing_sample", "missing_project"],
)
async def test_single_annotation_scope(api_client, setup_db, target, method):
    project_id = setup_db["project_id_1"]
    sample_id = setup_db["sample_id_1"]
    annotation_id = setup_db["annotation_id_1"]
    if target == "missing":
        annotation_id = "0" * 24
    elif target == "wrong_sample":
        sample_id = setup_db["sample_id_2"]
    elif target == "missing_sample":
        sample_id = "0" * 24
    elif target == "missing_project":
        project_id = "0" * 24
    else:
        project_id = setup_db["project_id_2"]
        sample_id = setup_db["sample_id_3"]

    response = await api_client.request(
        method,
        f"/projects/{project_id}/samples/{sample_id}/annotations/{annotation_id}",
        json={
            "type": "time_region",
            "label": "corrected",
            "time_min": 0.5,
            "time_max": 0.6,
        },
    )

    assert response.status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "annotation_key, payload",
    [
        (
            "annotation_id_1",
            {
                "type": "time_region",
                "label": "corrected",
                "time_min": 0.5,
                "time_max": 0.6,
            },
        ),
        ("annotation_id_3", {"type": "time_point", "label": "corrected", "time": 0.7}),
    ],
)
async def test_update_single_annotation_preserves_optional_fields(
    api_client, setup_db, db_client, annotation_key, payload
):
    path = f"/projects/{setup_db['project_id_1']}/samples/{setup_db['sample_id_1']}/annotations"
    annotation_id = setup_db[annotation_key]
    existing = (await api_client.get(path)).json()
    original = next(
        annotation for annotation in existing if annotation["_id"] == annotation_id
    )

    response = await api_client.put(f"{path}/{annotation_id}", json=payload)

    assert response.status_code == 200
    assert response.json() is None
    fetched = await api_client.get(f"{path}/{annotation_id}")
    assert fetched.status_code == 200
    updated = fetched.json()
    assert updated["validated"] == original["validated"]
    assert updated["uncertainty"] == original["uncertainty"]
    assert updated["signal_name"] == original["signal_name"]
    stored = await db_client.get_document_by_id("annotations", ObjectId(annotation_id))
    assert stored["uncertainty"] == original["uncertainty"]


@pytest.mark.asyncio
async def test_update_single_annotation_wrong_type(api_client, setup_db):
    response = await api_client.put(
        f"/projects/{setup_db['project_id_1']}/samples/{setup_db['sample_id_1']}/annotations/{setup_db['annotation_id_1']}",
        json={"type": "time_point", "label": "wrong type", "time": 0.5},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_update_annotations(api_client, setup_db, db_client):
    in_annotations = [
        {
            "label": "ramp_up",
            "time_min": 0.1,
            "time_max": 0.2,
            "created_by": "manual",
            "type": "time_region",
            "validated": True,
        },
        {
            "label": "flat_top",
            "time_min": 0.2,
            "time_max": 0.5,
            "created_by": "manual",
            "type": "time_region",
            "validated": True,
        },
        {
            "label": "disruption",
            "time": 0.5,
            "created_by": "manual",
            "type": "time_point",
            "validated": True,
        },
    ]

    project_id = "project_id_1"
    sample_id = "sample_id_2"
    response = await api_client.put(
        f"/projects/{setup_db[project_id]}/samples/{setup_db[sample_id]}/annotations",
        json=in_annotations,
    )
    assert response.status_code == 200

    # Check they have been added to database (existing annotations from other users are preserved)
    annotations = await db_client.get_all_documents("annotations")
    assert len(annotations) == 8
    db_annotations = await db_client.get_filtered_documents(
        "annotations", filters={"sample_id": ObjectId(setup_db[sample_id])}
    )
    for in_annotation in in_annotations:
        # Find annotation with that label
        db_annotation = next(
            annotation
            for annotation in db_annotations
            if annotation["label"] == in_annotation["label"]
        )
        for key, value in in_annotation.items():
            if key == "created_by":
                continue  # server overwrites created_by with authenticated user
            assert db_annotation[key] == value

        assert db_annotation.get("timestamp")
        assert db_annotation.get("_id")
        assert str(db_annotation.get("project_id")) == setup_db[project_id]
        assert str(db_annotation.get("sample_id")) == setup_db[sample_id]


@pytest.mark.asyncio
async def test_update_annotation_invalid(api_client, setup_db, db_client):
    in_annotations = [
        {"time": 5.2, "validated": "validated"},
    ]
    response = await api_client.put(
        f"/projects/{setup_db['project_id_1']}/samples/{setup_db['sample_id_3']}/annotations",
        json=in_annotations,
    )
    assert response.status_code == 422
    errors = response.json().get("detail", [])
    # Should flag that label is missing, validated is wrong type
    # It will also flag validation errors from all other possible 'annotation' schemas since none validated correctly...
    assert len(errors) >= 2

    # Check it has not been added to database
    annotations = await db_client.get_all_documents("annotations")
    assert len(annotations) == 5
    assert setup_db["sample_id_3"] not in [
        annotation["sample_id"] for annotation in annotations
    ]


@pytest.mark.asyncio
async def test_export_annotations(api_client, setup_db):
    response = await api_client.get(f"/projects/{setup_db['project_id_1']}/annotations")
    assert response.status_code == 200
    exported_data = response.json()

    # Check that all annotations for the sample are exported
    assert len(exported_data) == 4
    # Verify annotation IDs match
    exported_ids = [annotation["_id"] for annotation in exported_data]
    assert setup_db["annotation_id_1"] in exported_ids
    assert setup_db["annotation_id_2"] in exported_ids
    assert setup_db["annotation_id_3"] in exported_ids


@pytest.mark.asyncio
async def test_import_annotations(api_client, setup_db, db_client):
    import_data = [
        {
            "project_id": setup_db["project_id_1"],
            "sample_id": setup_db["sample_id_2"],
            "shot_id": 2,
            "label": "new_annotation",
            "time_min": 0.3,
            "time_max": 0.4,
            "created_by": "manual",
            "type": "time_region",
            "validated": False,
        },
        {
            "project_id": setup_db["project_id_1"],
            "sample_id": setup_db["sample_id_2"],
            "shot_id": 2,
            "label": "another_annotation",
            "time": 0.6,
            "created_by": "manual",
            "type": "time_point",
            "validated": True,
        },
    ]

    response = await api_client.put(
        f"/projects/{setup_db['project_id_1']}/annotations",
        json=import_data,
    )
    assert response.status_code == 200

    # Check annotations were added to database
    annotations = await db_client.get_all_documents("annotations")
    assert len(annotations) == 7

    # created_by is overwritten with the authenticated caller (passthrough admin);
    # the supplied "manual" author is ignored. Only the internal Ray-worker user may
    # preserve its own created_by.
    db_annotations = await db_client.get_filtered_documents(
        "annotations", filters={"sample_id": ObjectId(setup_db["sample_id_2"])}
    )
    (admin,) = await db_client.get_filtered_documents(
        "users", filters={"username": "admin"}
    )
    imported_annotations = [
        ann for ann in db_annotations if ann["created_by"] == str(admin["_id"])
    ]
    assert len(imported_annotations) == 2


@pytest.mark.asyncio
async def test_batch_update_annotations(api_client, setup_db, db_client):
    """Test batch updating annotations by first deleting existing ones then importing new ones."""
    # First delete existing annotations for the samples we're updating
    await api_client.delete(
        f"/projects/{setup_db['project_id_1']}/samples/{setup_db['sample_id_1']}/annotations"
    )
    await api_client.delete(
        f"/projects/{setup_db['project_id_1']}/samples/{setup_db['sample_id_2']}/annotations"
    )

    annotations_batch = [
        {
            "project_id": setup_db["project_id_1"],
            "sample_id": setup_db["sample_id_1"],
            "shot_id": 1,
            "type": "time_point",
            "label": "TestAnnotation1",
            "time": 1,
            "created_by": "disruption_cnn",
        },
        {
            "project_id": setup_db["project_id_1"],
            "sample_id": setup_db["sample_id_1"],
            "shot_id": 1,
            "type": "time_point",
            "label": "TestAnnotation2",
            "time": 2,
            "created_by": "disruption_cnn",
        },
        {
            "project_id": setup_db["project_id_1"],
            "sample_id": setup_db["sample_id_2"],
            "shot_id": 2,
            "label": "TestAnnotation",
            "type": "time_region",
            "time_min": 1,
            "time_max": 2,
            "created_by": "disruption_cnn",
        },
    ]

    response = await api_client.put(
        f"/projects/{setup_db['project_id_1']}/annotations", json=annotations_batch
    )
    assert response.status_code == 200

    # Check annotations for sample 1 have been updated
    annotations_sample_1 = await db_client.get_filtered_documents(
        "annotations",
        filters={"sample_id": ObjectId(setup_db["sample_id_1"])},
        sort_by="time",
        sort_direction="ascending",
    )
    assert len(annotations_sample_1) == 2
    assert annotations_sample_1[0]["label"] == "TestAnnotation1"
    assert annotations_sample_1[0]["time"] == 1
    assert annotations_sample_1[1]["label"] == "TestAnnotation2"
    assert annotations_sample_1[1]["time"] == 2

    # Check annotation for sample 2 also updated
    annotations_sample_1 = await db_client.get_filtered_documents(
        "annotations", filters={"sample_id": ObjectId(setup_db["sample_id_2"])}
    )
    assert len(annotations_sample_1) == 1
    assert annotations_sample_1[0]["label"] == "TestAnnotation"
    assert annotations_sample_1[0]["time_min"] == 1
    assert annotations_sample_1[0]["time_max"] == 2
