"""Integration tests for /users and /projects/{id}/members endpoints."""

import asyncio

import pytest

from tests.api.auth.conftest import add_member, get_auth_token


@pytest.mark.asyncio
async def test_list_users_as_admin(unauthenticated_api_client, setup_db_auth):
    client = unauthenticated_api_client
    token = get_auth_token("admin")
    response = await client.get("/users", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    users = response.json()
    usernames = [u["username"] for u in users]
    assert "admin" in usernames
    assert "alice" in usernames
    assert "bob" in usernames


@pytest.mark.asyncio
async def test_list_users_non_admin_forbidden(
    unauthenticated_api_client, setup_db_auth
):
    client = unauthenticated_api_client
    token = get_auth_token("alice")
    response = await client.get("/users", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_get_user_by_id_self(unauthenticated_api_client, setup_db_auth):
    client = unauthenticated_api_client
    token = get_auth_token("alice")
    alice_id = setup_db_auth["alice_id"]
    response = await client.get(
        f"/users/{alice_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["username"] == "alice"


@pytest.mark.asyncio
async def test_get_other_user_as_non_admin_forbidden(
    unauthenticated_api_client, setup_db_auth
):
    client = unauthenticated_api_client
    token = get_auth_token("alice")
    bob_id = setup_db_auth["bob_id"]
    response = await client.get(
        f"/users/{bob_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_user_cannot_self_promote_global_role(
    unauthenticated_api_client, setup_db_auth
):
    """A non-admin editing their own record must not be able to set
    global_role — self-edit bypasses the "editing someone else" check, so
    this has to be enforced separately or any user could self-promote."""
    client = unauthenticated_api_client
    token = get_auth_token("alice")
    alice_id = setup_db_auth["alice_id"]
    response = await client.put(
        f"/users/{alice_id}",
        json={"global_role": "admin"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403

    get_resp = await client.get(
        f"/users/{alice_id}", headers={"Authorization": f"Bearer {token}"}
    )
    assert get_resp.json()["global_role"] == "user"


@pytest.mark.asyncio
async def test_user_cannot_self_reactivate_via_is_active(
    unauthenticated_api_client, setup_db_auth
):
    """Same guard, is_active side: a non-admin must not be able to flip their
    own is_active flag either."""
    client = unauthenticated_api_client
    token = get_auth_token("alice")
    alice_id = setup_db_auth["alice_id"]
    response = await client.put(
        f"/users/{alice_id}",
        json={"is_active": False},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_delete_user_as_non_admin_forbidden(
    unauthenticated_api_client, setup_db_auth
):
    client = unauthenticated_api_client
    token = get_auth_token("alice")
    bob_id = setup_db_auth["bob_id"]
    response = await client.delete(
        f"/users/{bob_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_delete_own_user_as_non_admin_forbidden(
    unauthenticated_api_client, setup_db_auth
):
    """Delete requires global admin unconditionally — there's no self-service
    exception the way update_user has (current_user.id == user_id)."""
    client = unauthenticated_api_client
    token = get_auth_token("alice")
    alice_id = setup_db_auth["alice_id"]
    response = await client.delete(
        f"/users/{alice_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


async def _make_admin(db_client, username: str) -> None:
    """Role changes come from the identity provider, so tests set them directly."""
    await db_client.db["users"].update_one(
        {"username": username}, {"$set": {"global_role": "admin"}}
    )


def _bearer(username: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {get_auth_token(username)}"}


@pytest.mark.asyncio
async def test_users_cannot_be_created_through_the_api(
    unauthenticated_api_client, setup_db_auth, db_client
):
    """Accounts appear on first sign-in through the identity provider, never by POST."""
    response = await unauthenticated_api_client.post(
        "/users",
        json={"username": "newuser", "global_role": "admin"},
        headers=_bearer("admin"),
    )

    assert not response.is_success
    assert (
        await db_client.get_filtered_documents("users", {"username": "newuser"}) == []
    )


@pytest.mark.asyncio
async def test_update_other_user_as_non_admin_forbidden(
    unauthenticated_api_client, setup_db_auth
):
    """Checks the admin-only rule itself, apart from the self-edit guards above."""
    response = await unauthenticated_api_client.put(
        f"/users/{setup_db_auth['bob_id']}",
        json={"is_active": False},
        headers=_bearer("alice"),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_update_user_ignores_global_role(
    unauthenticated_api_client, setup_db_auth
):
    """Roles come from the identity provider, so an admin cannot set one here."""
    client = unauthenticated_api_client
    bob_id = setup_db_auth["bob_id"]

    response = await client.put(
        f"/users/{bob_id}", json={"global_role": "admin"}, headers=_bearer("admin")
    )

    assert response.status_code == 200
    get_resp = await client.get(f"/users/{bob_id}", headers=_bearer("admin"))
    assert get_resp.json()["global_role"] == "user"


@pytest.mark.asyncio
async def test_admin_can_deactivate_and_reactivate_another_user(
    unauthenticated_api_client, setup_db_auth
):
    client = unauthenticated_api_client
    bob_id = setup_db_auth["bob_id"]

    response = await client.put(
        f"/users/{bob_id}", json={"is_active": False}, headers=_bearer("admin")
    )
    assert response.status_code == 200
    get_resp = await client.get(f"/users/{bob_id}", headers=_bearer("admin"))
    assert get_resp.json()["is_active"] is False
    me_resp = await client.get("/auth/me", headers=_bearer("bob"))
    assert me_resp.status_code == 401

    response = await client.put(
        f"/users/{bob_id}", json={"is_active": True}, headers=_bearer("admin")
    )
    assert response.status_code == 200
    me_resp = await client.get("/auth/me", headers=_bearer("bob"))
    assert me_resp.status_code == 200


@pytest.mark.asyncio
async def test_update_user_with_an_empty_body_changes_nothing(
    unauthenticated_api_client, setup_db_auth
):
    bob_id = setup_db_auth["bob_id"]

    response = await unauthenticated_api_client.put(
        f"/users/{bob_id}", json={}, headers=_bearer("admin")
    )

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_update_unknown_user_is_404(unauthenticated_api_client, setup_db_auth):
    response = await unauthenticated_api_client.put(
        "/users/000000000000000000000099",
        json={"is_active": False},
        headers=_bearer("admin"),
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_user_as_admin(unauthenticated_api_client, setup_db_auth):
    client = unauthenticated_api_client

    response = await client.delete(
        f"/users/{setup_db_auth['bob_id']}", headers=_bearer("admin")
    )

    assert response.status_code == 200
    me_resp = await client.get("/auth/me", headers=_bearer("bob"))
    assert me_resp.status_code == 401


@pytest.mark.asyncio
async def test_admin_cannot_deactivate_self_even_with_another_admin(
    unauthenticated_api_client, setup_db_auth, db_client
):
    """Deactivating yourself would cut off the admin UI you are using.

    A different admin has to do it, even when one exists.
    """
    client = unauthenticated_api_client
    admin_id = setup_db_auth["admin_id"]
    await _make_admin(db_client, "alice")

    response = await client.put(
        f"/users/{admin_id}", json={"is_active": False}, headers=_bearer("admin")
    )

    assert response.status_code == 422
    get_resp = await client.get(f"/users/{admin_id}", headers=_bearer("admin"))
    assert get_resp.json()["is_active"] is True


@pytest.mark.asyncio
async def test_admin_can_be_deactivated_by_a_different_admin(
    unauthenticated_api_client, setup_db_auth, db_client
):
    client = unauthenticated_api_client
    admin_id = setup_db_auth["admin_id"]
    await _make_admin(db_client, "alice")

    response = await client.put(
        f"/users/{admin_id}", json={"is_active": False}, headers=_bearer("alice")
    )

    assert response.status_code == 200
    get_resp = await client.get(f"/users/{admin_id}", headers=_bearer("alice"))
    assert get_resp.json()["is_active"] is False


@pytest.mark.asyncio
async def test_admin_cannot_delete_own_user_as_last_admin(
    unauthenticated_api_client, setup_db_auth
):
    """Deleting the sole active admin must be blocked, or nobody could fix the account list."""
    client = unauthenticated_api_client

    response = await client.delete(
        f"/users/{setup_db_auth['admin_id']}", headers=_bearer("admin")
    )

    assert response.status_code == 422
    assert (await client.get("/auth/me", headers=_bearer("admin"))).status_code == 200


@pytest.mark.asyncio
async def test_admin_can_delete_own_user_when_another_admin_remains(
    unauthenticated_api_client, setup_db_auth, db_client
):
    client = unauthenticated_api_client
    await _make_admin(db_client, "alice")

    response = await client.delete(
        f"/users/{setup_db_auth['admin_id']}", headers=_bearer("admin")
    )

    assert response.status_code == 200
    assert (await client.get("/auth/me", headers=_bearer("admin"))).status_code == 401


@pytest.mark.asyncio
async def test_concurrent_mutual_deactivation_keeps_an_admin(
    unauthenticated_api_client, setup_db_auth, db_client
):
    client = unauthenticated_api_client
    await _make_admin(db_client, "alice")

    responses = await asyncio.gather(
        client.put(
            f"/users/{setup_db_auth['alice_id']}",
            json={"is_active": False},
            headers=_bearer("admin"),
        ),
        client.put(
            f"/users/{setup_db_auth['admin_id']}",
            json={"is_active": False},
            headers=_bearer("alice"),
        ),
    )

    assert sorted(r.status_code for r in responses) == [200, 422]
    users = await db_client.get_filtered_documents("users")
    active_admins = [
        user for user in users if user["global_role"] == "admin" and user["is_active"]
    ]
    assert len(active_admins) == 1


@pytest.mark.asyncio
async def test_add_and_list_project_members(setup_db_auth, unauthenticated_api_client):
    client = unauthenticated_api_client
    admin_token = get_auth_token("admin")
    project_id = setup_db_auth["project_id"]

    # Add alice as annotator (uses username, not user_id)
    resp = await client.post(
        f"/projects/{project_id}/members",
        json={"username": "alice", "role": "annotator"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200

    # List members
    list_resp = await client.get(
        f"/projects/{project_id}/members",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert list_resp.status_code == 200
    members = list_resp.json()
    usernames = [m["username"] for m in members]
    assert "alice" in usernames


@pytest.mark.asyncio
async def test_add_member_non_admin_forbidden(
    setup_db_auth, unauthenticated_api_client
):
    client = unauthenticated_api_client
    project_id = setup_db_auth["project_id"]
    alice_token = get_auth_token("alice")

    resp = await client.post(
        f"/projects/{project_id}/members",
        json={"username": "bob", "role": "annotator"},
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_update_member_show_others_annotations(
    setup_db_auth, unauthenticated_api_client
):
    client = unauthenticated_api_client
    admin_token = get_auth_token("admin")
    project_id = setup_db_auth["project_id"]
    alice_token = get_auth_token("alice")

    # Add alice as annotator (uses username, not user_id)
    await client.post(
        f"/projects/{project_id}/members",
        json={"username": "alice", "role": "annotator"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    # Alice updates her own show_others_annotations preference
    resp = await client.put(
        f"/projects/{project_id}/members/{setup_db_auth['alice_id']}",
        json={"show_others_annotations": False},
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    assert resp.status_code == 200

    # Verify the DB value changed
    members_resp = await client.get(
        f"/projects/{project_id}/members",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    alice_member = next(m for m in members_resp.json() if m["username"] == "alice")
    assert alice_member["show_others_annotations"] is False


@pytest.mark.asyncio
async def test_remove_project_member(setup_db_auth, unauthenticated_api_client):
    client = unauthenticated_api_client
    admin_token = get_auth_token("admin")
    project_id = setup_db_auth["project_id"]

    await client.post(
        f"/projects/{project_id}/members",
        json={"username": "alice", "role": "annotator"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    del_resp = await client.delete(
        f"/projects/{project_id}/members/{setup_db_auth['alice_id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert del_resp.status_code == 200

    list_resp = await client.get(
        f"/projects/{project_id}/members",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    usernames = [m["username"] for m in list_resp.json()]
    assert "alice" not in usernames


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["viewer", "annotator"])
async def test_member_cannot_self_promote_project_role(
    setup_db_auth, unauthenticated_api_client, role
):
    """A member must not be able to promote themselves by editing their own membership.

    The self-edit path exists so a member can set show_others_annotations, but it
    must not extend to `role` — otherwise a viewer PUTs {"role": "admin"} on their
    own membership and becomes a project admin.
    """
    client = unauthenticated_api_client
    admin_token = get_auth_token("admin")
    project_id = setup_db_auth["project_id"]
    alice_id = setup_db_auth["alice_id"]

    await add_member(client, admin_token, project_id, "alice", role)
    alice_token = get_auth_token("alice")

    resp = await client.put(
        f"/projects/{project_id}/members/{alice_id}",
        json={"role": "admin"},
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    assert resp.status_code == 403

    # The stored role must be untouched.
    members_resp = await client.get(
        f"/projects/{project_id}/members",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    alice_member = next(m for m in members_resp.json() if m["username"] == "alice")
    assert alice_member["role"] == role


@pytest.mark.asyncio
async def test_project_admin_can_manage_members_without_global_admin(
    setup_db_auth, unauthenticated_api_client
):
    """A project admin whose global_role is only "user" can still manage members."""
    client = unauthenticated_api_client
    admin_token = get_auth_token("admin")
    project_id = setup_db_auth["project_id"]

    await add_member(client, admin_token, project_id, "alice", "admin")
    alice_token = get_auth_token("alice")

    # alice is a project admin but a plain global user
    me_resp = await client.get(
        "/auth/me", headers={"Authorization": f"Bearer {alice_token}"}
    )
    assert me_resp.json()["global_role"] == "user"

    add_resp = await client.post(
        f"/projects/{project_id}/members",
        json={"username": "bob", "role": "viewer"},
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    assert add_resp.status_code == 200, add_resp.text

    # ...including changing another member's role, which the self-edit guard must
    # not have broken.
    role_resp = await client.put(
        f"/projects/{project_id}/members/{setup_db_auth['bob_id']}",
        json={"role": "annotator"},
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    assert role_resp.status_code == 200, role_resp.text

    del_resp = await client.delete(
        f"/projects/{project_id}/members/{setup_db_auth['bob_id']}",
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    assert del_resp.status_code == 200, del_resp.text


@pytest.mark.asyncio
async def test_list_my_memberships_is_self_scoped(
    setup_db_auth, unauthenticated_api_client
):
    """/users/me/memberships reports only the caller's own memberships."""
    client = unauthenticated_api_client
    admin_token = get_auth_token("admin")
    project_id = setup_db_auth["project_id"]

    await add_member(client, admin_token, project_id, "alice", "viewer")
    alice_token = get_auth_token("alice")
    bob_token = get_auth_token("bob")

    alice_resp = await client.get(
        "/users/me/memberships", headers={"Authorization": f"Bearer {alice_token}"}
    )
    assert alice_resp.status_code == 200
    alice_memberships = alice_resp.json()
    assert len(alice_memberships) == 1
    assert alice_memberships[0]["project_id"] == project_id
    assert alice_memberships[0]["role"] == "viewer"
    assert alice_memberships[0]["user_id"] == setup_db_auth["alice_id"]

    # bob is in no projects
    bob_resp = await client.get(
        "/users/me/memberships", headers={"Authorization": f"Bearer {bob_token}"}
    )
    assert bob_resp.status_code == 200
    assert bob_resp.json() == []

    # "me" must not be read as a user_id by GET /users/{user_id}
    assert (await client.get("/users/me/memberships")).status_code == 401
