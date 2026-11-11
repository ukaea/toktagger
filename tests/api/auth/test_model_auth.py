"""
Tests for model × auth interactions:
  1. Internal API token can update model status on any project, and is rejected
     on every other endpoint.
  2. Unauthenticated sender is rejected when auth is required.
  3. Non-admin bulk import enforces created_by = current user.
  4. Global admin bulk import allows arbitrary created_by.
  5. Usernames with reserved prefixes ("model::", "annotators::", "__") are never provisioned.
  6. A user whose username matches a model-type string cannot corrupt
     "model::<type>" prefixed predictions.
"""

import pytest

from tests.api.auth.conftest import ISSUER
from tests.db_definitions import USER_ADMIN_ID, USER_ALICE_ID
from tests.identity import get_auth_token, session_headers
from toktagger.api.auth import oidc
from toktagger.api.auth.core import get_internal_token
from toktagger.api.schemas.users import UserIn


def annotation_payload(
    label: str = "lbl", created_by: str = "placeholder", shot_id: int = 1
):
    """Payload suitable for bulk import (PUT /projects/{id}/annotations).
    shot_id must match an existing sample — the default matches the sample
    created by setup (shot_id=1).
    """
    return [
        {
            "label": label,
            "time_min": 0.0,
            "time_max": 1.0,
            "type": "time_region",
            "validated": False,
            "created_by": created_by,
            "shot_id": shot_id,
        }
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/auth/me"),
        ("GET", "/users"),
        ("DELETE", "/projects/{project_id}"),
        ("POST", "/projects/{project_id}/samples"),
        ("PUT", "/projects/{project_id}/samples"),
        ("PUT", "/projects/{project_id}/annotations"),
        ("POST", "/projects"),
    ],
)
async def test_internal_token_rejected_outside_worker_callbacks(
    setup_db_auth, unauthenticated_api_client, method, path
):
    """A leaked worker token must reach only the model status route, nothing else."""
    resp = await unauthenticated_api_client.request(
        method,
        path.format(project_id=setup_db_auth["project_id"]),
        json=[],
        headers={"Authorization": f"Bearer {get_internal_token()}"},
    )

    assert resp.status_code == 403, resp.text
    assert resp.json()["detail"] == "The internal token is not valid here"


@pytest.mark.asyncio
async def test_internal_token_updates_model_status_without_membership(
    model_status_url, unauthenticated_api_client
):
    """Ray workers report progress on every project, though the internal user is a member of none."""
    resp = await unauthenticated_api_client.put(
        model_status_url,
        json={"progress": 50},
        headers={"Authorization": f"Bearer {get_internal_token()}"},
    )

    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_non_member_cannot_update_model_status(
    model_status_url, unauthenticated_api_client
):
    resp = await unauthenticated_api_client.put(
        model_status_url,
        json={"progress": 50},
        headers=session_headers(get_auth_token(USER_ALICE_ID)),
    )

    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_no_token_rejected_for_import_in_auth_mode(
    setup_db_auth, unauthenticated_api_client
):
    """PUT /annotations with no token must be rejected when auth is required."""
    client = unauthenticated_api_client
    project_id = setup_db_auth["project_id"]

    resp = await client.put(
        f"/projects/{project_id}/annotations",
        json=annotation_payload(),
    )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Not authenticated"


@pytest.mark.asyncio
async def test_import_non_admin_created_by_overwritten(
    setup_db_auth, unauthenticated_api_client
):
    """An annotator importing with a spoofed created_by should have it replaced."""
    client = unauthenticated_api_client
    admin_token = get_auth_token(USER_ADMIN_ID)
    project_id = setup_db_auth["project_id"]

    await client.post(
        f"/projects/{project_id}/members",
        json={"username": "alice", "role": "annotator"},
        headers=session_headers(admin_token),
    )
    alice_token = get_auth_token(USER_ALICE_ID)

    resp = await client.put(
        f"/projects/{project_id}/annotations",
        json=annotation_payload(created_by=setup_db_auth["bob_id"]),
        headers=session_headers(alice_token),
    )
    assert resp.status_code == 200

    # Verify: annotation stored as alice, not bob
    get_resp = await client.get(
        f"/projects/{project_id}/annotations",
        headers=session_headers(admin_token),
    )
    assert get_resp.status_code == 200
    annotations = get_resp.json()
    assert len(annotations) == 1
    assert annotations[0]["created_by"] == setup_db_auth["alice_id"]


@pytest.mark.asyncio
async def test_import_admin_is_attributed_as_self(
    setup_db_auth, unauthenticated_api_client
):
    """A global admin importing annotations is recorded as the author; a
    supplied created_by is ignored so authorship stays auditable."""
    client = unauthenticated_api_client
    admin_token = get_auth_token(USER_ADMIN_ID)
    project_id = setup_db_auth["project_id"]

    resp = await client.put(
        f"/projects/{project_id}/annotations",
        json=annotation_payload(created_by=setup_db_auth["alice_id"]),
        headers=session_headers(admin_token),
    )
    assert resp.status_code == 200

    get_resp = await client.get(
        f"/projects/{project_id}/annotations",
        headers=session_headers(admin_token),
    )
    annotations = get_resp.json()
    assert len(annotations) == 1
    assert annotations[0]["created_by"] == setup_db_auth["admin_id"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "preferred_username",
    [
        "model::disruption_cnn",
        "annotators::peak_detection",
        "__internal__",
        "__user__",
        "__admin",
    ],
)
async def test_provisioned_username_never_uses_a_reserved_prefix(
    preferred_username, db_client, oidc_settings
):
    """Real users must not collide with the namespaces of models, annotators and the internal user."""
    user = await oidc.provision_user(
        db_client,
        ISSUER,
        {"sub": "sub-1", "preferred_username": preferred_username},
    )

    assert not user.username.startswith(oidc.RESERVED_USERNAME_PREFIXES)
    assert user.username


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "prefix,matching_name",
    [
        pytest.param("model::", "disruption_cnn", id="model"),
        pytest.param("annotators::", "peak_detection", id="annotators"),
    ],
)
async def test_user_save_does_not_corrupt_prefixed_predictions(
    prefix, matching_name, setup_db_auth, unauthenticated_api_client, db_client
):
    """A human user whose name matches a reserved-prefix type (a model type like
    'disruption_cnn', or a built-in annotator type like 'peak_detection') saving
    annotations must NOT delete the machine-made annotations stored under that
    prefix (e.g. 'model::disruption_cnn' or 'annotators::peak_detection'). The
    prefix is the separator.

    This hand-crafts the prefixed annotation via a direct import, so it only proves the import endpoint's exemption logic — not that the
    real /predict pipeline or annotator suggestion pipeline actually produces that
    prefix. For the real end-to-end version of the model case (actual /predict
    call, real Ray worker, real per-user JWTs), see
    test_predict_endpoint_survives_same_named_human_save in
    tests/api/routers/test_models.py.
    """
    prefixed_created_by = f"{prefix}{matching_name}"
    client = unauthenticated_api_client
    admin_token = get_auth_token(USER_ADMIN_ID)
    project_id = setup_db_auth["project_id"]
    sample_id = setup_db_auth["sample_id"]

    # A human user whose name matches a reserved-prefix type (the collision scenario).
    human_id = await db_client.insert(
        "users",
        UserIn(
            username=matching_name,
            oidc_issuer=ISSUER,
            oidc_sub=f"{matching_name}-sub",
        ),
    )

    # Import keeps a reserved-prefix author, so an admin import seeds the machine annotation.
    await client.put(
        f"/projects/{project_id}/annotations",
        json=annotation_payload(label="machine_pred", created_by=prefixed_created_by),
        headers=session_headers(admin_token),
    )

    # The human user saves their own annotation for the same sample.
    await client.post(
        f"/projects/{project_id}/members",
        json={"username": matching_name, "role": "annotator"},
        headers=session_headers(admin_token),
    )
    human_token = get_auth_token(human_id)
    save_resp = await client.put(
        f"/projects/{project_id}/samples/{sample_id}/annotations",
        json=[
            {
                "label": "human_ann",
                "time_min": 0.0,
                "time_max": 1.0,
                "type": "time_region",
                "validated": True,
                "created_by": "placeholder",
            }
        ],
        headers=session_headers(human_token),
    )
    assert save_resp.status_code == 200

    # Both the machine-made and human annotation must survive — the reserved
    # prefix provides complete namespace separation.
    get_resp = await client.get(
        f"/projects/{project_id}/annotations",
        headers=session_headers(admin_token),
    )
    annotations = get_resp.json()
    labels_by_author = {a["created_by"]: a["label"] for a in annotations}
    assert labels_by_author.get(prefixed_created_by) == "machine_pred"
    assert labels_by_author.get(human_id) == "human_ann"


@pytest.mark.asyncio
async def test_import_preserves_machine_created_by(
    setup_db_auth, unauthenticated_api_client
):
    """Re-importing an export must not reassign predictions to the importer.

    Matches the sample-level save, which already exempts the reserved prefixes.
    """
    client = unauthenticated_api_client
    admin_token = get_auth_token(USER_ADMIN_ID)
    project_id = setup_db_auth["project_id"]

    await client.post(
        f"/projects/{project_id}/members",
        json={"username": "alice", "role": "annotator"},
        headers=session_headers(admin_token),
    )
    alice_token = get_auth_token(USER_ALICE_ID)

    resp = await client.put(
        f"/projects/{project_id}/annotations",
        json=annotation_payload(created_by="model::disruption_cnn")
        + annotation_payload(label="suggested", created_by="annotators::peak_detection")
        + annotation_payload(label="hand_drawn", created_by=setup_db_auth["bob_id"]),
        headers=session_headers(alice_token),
    )
    assert resp.status_code == 200, resp.text

    get_resp = await client.get(
        f"/projects/{project_id}/annotations",
        headers=session_headers(admin_token),
    )
    authors = sorted(a["created_by"] for a in get_resp.json())
    assert authors == sorted(
        [
            setup_db_auth["alice_id"],  # the spoofed human author is still replaced
            "annotators::peak_detection",
            "model::disruption_cnn",
        ]
    ), authors
