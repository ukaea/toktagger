import asyncio
import time

import httpx
import pytest
from bson import ObjectId
from joserfc import jwt
from joserfc.jwk import KeySet, OctKey, RSAKey

from tests.api.auth.conftest import CLIENT_ID, ISSUER, JWKS_URL, mint_token
from toktagger.api.auth import oidc
from toktagger.api.crud import utils
from toktagger.api.schemas.projects import ProjectMember


def test_extract_roles_reads_a_list():
    claims = {"groups": ["a", "b"]}
    assert oidc.extract_roles(claims, "groups") == ["a", "b"]


def test_extract_roles_accepts_a_single_string():
    assert oidc.extract_roles({"groups": "a"}, "groups") == ["a"]


def test_extract_roles_follows_a_dotted_path():
    claims = {"realm_access": {"roles": ["toktagger-admins"]}}
    assert oidc.extract_roles(claims, "realm_access.roles") == ["toktagger-admins"]


def test_extract_roles_prefers_a_claim_name_containing_dots():
    claims = {"https://example.com/roles": ["x"], "https": {}}
    assert oidc.extract_roles(claims, "https://example.com/roles") == ["x"]


def test_extract_roles_strips_one_leading_slash():
    claims = {"groups": ["/toktagger-admins", "/parent/child"]}
    assert oidc.extract_roles(claims, "groups") == ["toktagger-admins", "parent/child"]


@pytest.mark.parametrize(
    "claims,path",
    [
        ({}, "groups"),
        ({"groups": None}, "groups"),
        ({"realm_access": ["a"]}, "realm_access.roles"),
        ({"realm_access": {}}, "realm_access.roles"),
    ],
)
def test_extract_roles_returns_nothing_when_the_claim_is_absent(claims, path):
    assert oidc.extract_roles(claims, path) == []


def test_extract_roles_ignores_non_string_values():
    assert oidc.extract_roles({"groups": ["a", 3, None, {"x": 1}]}, "groups") == ["a"]


def test_derive_username_prefers_preferred_username():
    claims = {"preferred_username": "alice", "email": "a@x.org", "sub": "s"}
    assert oidc.derive_username(claims) == "alice"


def test_derive_username_falls_back_to_email_then_sub():
    assert oidc.derive_username({"email": "bob@x.org", "sub": "s"}) == "bob"
    assert oidc.derive_username({"sub": "subject-9"}) == "subject-9"


@pytest.mark.parametrize(
    "preferred,expected",
    [
        ("model::worker", "worker"),
        ("annotators::bot", "bot"),
        ("__internal__", "internal__"),
        ("__model::x", "x"),
    ],
)
def test_derive_username_removes_reserved_prefixes(preferred, expected):
    assert oidc.derive_username({"preferred_username": preferred}) == expected


def test_derive_username_skips_a_name_that_is_only_a_prefix():
    claims = {"preferred_username": "__", "email": "carol@x.org", "sub": "s"}
    assert oidc.derive_username(claims) == "carol"


@pytest.mark.asyncio
async def test_provision_creates_a_user_from_claims(db_client, oidc_settings):
    claims = {
        "sub": "sub-1",
        "preferred_username": "alice",
        "email": "alice@example.com",
        "name": "Alice Example",
    }

    user = await oidc.provision_user(db_client, ISSUER, claims)

    assert user.username == "alice"
    assert user.email == "alice@example.com"
    assert user.display_name == "Alice Example"
    assert user.global_role == "user"
    assert user.is_active is True


@pytest.mark.asyncio
async def test_provision_is_idempotent_for_the_same_identity(db_client, oidc_settings):
    claims = {"sub": "sub-1", "preferred_username": "alice"}

    first = await oidc.provision_user(db_client, ISSUER, claims)
    second = await oidc.provision_user(db_client, ISSUER, claims)

    assert first.id == second.id
    assert len(await db_client.get_filtered_documents("users")) == 1


@pytest.mark.asyncio
async def test_provision_concurrent_first_logins_create_one_user(
    db_client, oidc_settings
):
    claims = {"sub": "sub-1", "preferred_username": "alice"}

    users = await asyncio.gather(
        *(oidc.provision_user(db_client, ISSUER, claims) for _ in range(5))
    )

    assert len({user.id for user in users}) == 1
    assert len(await db_client.get_filtered_documents("users")) == 1


@pytest.mark.asyncio
async def test_provision_adds_a_suffix_when_the_username_is_taken(
    db_client, oidc_settings
):
    first = await oidc.provision_user(
        db_client, ISSUER, {"sub": "sub-1", "preferred_username": "alice"}
    )
    second = await oidc.provision_user(
        db_client, ISSUER, {"sub": "sub-2", "preferred_username": "alice"}
    )
    third = await oidc.provision_user(
        db_client, ISSUER, {"sub": "sub-3", "preferred_username": "alice"}
    )

    assert [first.username, second.username, third.username] == [
        "alice",
        "alice2",
        "alice3",
    ]


@pytest.mark.asyncio
async def test_provision_keys_users_on_issuer_and_subject(db_client, oidc_settings):
    claims = {"sub": "sub-1", "preferred_username": "alice"}

    first = await oidc.provision_user(db_client, ISSUER, claims)
    other_issuer = await oidc.provision_user(db_client, "https://other.example", claims)

    assert first.id != other_issuer.id
    assert other_issuer.username == "alice2"


@pytest.mark.asyncio
async def test_provision_sanitises_a_reserved_prefix_username(db_client, oidc_settings):
    user = await oidc.provision_user(
        db_client, ISSUER, {"sub": "sub-1", "preferred_username": "model::worker"}
    )

    assert user.username == "worker"


@pytest.mark.asyncio
async def test_provision_never_renames_an_existing_user(db_client, oidc_settings):
    first = await oidc.provision_user(
        db_client, ISSUER, {"sub": "sub-1", "preferred_username": "alice"}
    )

    again = await oidc.provision_user(
        db_client,
        ISSUER,
        {"sub": "sub-1", "preferred_username": "alice-renamed", "email": "n@x.org"},
    )

    assert again.id == first.id
    assert again.username == "alice"
    assert again.email == "n@x.org"


@pytest.mark.asyncio
async def test_provision_requires_a_subject(db_client, oidc_settings):
    with pytest.raises(ValueError):
        await oidc.provision_user(db_client, ISSUER, {"preferred_username": "alice"})


@pytest.mark.parametrize(
    "roles_claim,claims",
    [
        ("groups", {"groups": ["toktagger-admins"]}),
        ("groups", {"groups": ["/toktagger-admins"]}),
        ("groups", {"groups": "toktagger-admins"}),
        ("realm_access.roles", {"realm_access": {"roles": ["toktagger-admins"]}}),
    ],
)
@pytest.mark.asyncio
async def test_provision_gives_admin_role_from_the_admin_group(
    db_client, oidc_settings, monkeypatch, roles_claim, claims
):
    monkeypatch.setattr(oidc_settings, "roles_claim", roles_claim)

    user = await oidc.provision_user(
        db_client, ISSUER, {"sub": "sub-1", "preferred_username": "alice", **claims}
    )

    assert user.global_role == "admin"


@pytest.mark.asyncio
async def test_provision_global_role_follows_the_provider_both_ways(
    db_client, oidc_settings
):
    identity = {"sub": "sub-1", "preferred_username": "alice"}

    promoted = await oidc.provision_user(
        db_client, ISSUER, {**identity, "groups": ["toktagger-admins"]}
    )
    demoted = await oidc.provision_user(
        db_client, ISSUER, {**identity, "groups": ["other"]}
    )
    promoted_again = await oidc.provision_user(
        db_client, ISSUER, {**identity, "groups": ["toktagger-admins"]}
    )

    assert promoted.global_role == "admin"
    assert demoted.global_role == "user"
    assert promoted_again.global_role == "admin"
    assert {promoted.id, demoted.id, promoted_again.id} == {promoted.id}


@pytest.mark.asyncio
async def test_provision_uses_the_configured_admin_group(
    db_client, oidc_settings, monkeypatch
):
    monkeypatch.setattr(oidc_settings, "admin_group", "site-admins")
    identity = {"sub": "sub-1", "preferred_username": "alice"}

    default_group = await oidc.provision_user(
        db_client, ISSUER, {**identity, "groups": ["toktagger-admins"]}
    )
    custom_group = await oidc.provision_user(
        db_client, ISSUER, {**identity, "groups": ["site-admins"]}
    )

    assert default_group.global_role == "user"
    assert custom_group.global_role == "admin"


@pytest.mark.asyncio
async def test_provision_keeps_a_locally_deactivated_user_inactive(
    db_client, oidc_settings
):
    identity = {"sub": "sub-1", "preferred_username": "alice"}
    user = await oidc.provision_user(db_client, ISSUER, identity)
    await db_client.db["users"].update_one(
        {"username": "alice"}, {"$set": {"is_active": False}}
    )

    again = await oidc.provision_user(
        db_client, ISSUER, {**identity, "groups": ["toktagger-admins"]}
    )

    assert again.id == user.id
    assert again.is_active is False


@pytest.mark.asyncio
async def test_provision_adopts_a_legacy_user_with_the_same_username(
    db_client, oidc_settings
):
    legacy = await db_client.db["users"].insert_one(
        {
            "username": "legacy",
            "hashed_password": "pbkdf2:salt:hash",
            "must_change_password": True,
            "global_role": "user",
            "is_active": True,
        }
    )

    user = await oidc.provision_user(
        db_client, ISSUER, {"sub": "sub-1", "preferred_username": "legacy"}
    )

    assert user.id == str(legacy.inserted_id)
    assert user.username == "legacy"
    document = (await db_client.get_filtered_documents("users"))[0]
    assert document["oidc_issuer"] == ISSUER
    assert document["oidc_sub"] == "sub-1"
    assert document["hashed_password"] is None
    assert document["must_change_password"] is False


@pytest.mark.asyncio
async def test_provision_keeps_memberships_of_an_adopted_user(
    db_client, oidc_settings, setup_db_auth
):
    await db_client.db["users"].update_one(
        {"username": "alice"}, {"$set": {"oidc_sub": None, "oidc_issuer": None}}
    )
    await db_client.insert(
        "project_members",
        ProjectMember(role="annotator"),
        ids={
            "project_id": ObjectId(setup_db_auth["project_id"]),
            "user_id": ObjectId(setup_db_auth["alice_id"]),
        },
    )

    user = await oidc.provision_user(
        db_client, ISSUER, {"sub": "new-sub", "preferred_username": "alice"}
    )

    assert user.id == setup_db_auth["alice_id"]
    memberships = await utils.get_user_memberships(db_client, user.id)
    assert [member.role for member in memberships] == ["annotator"]


@pytest.mark.asyncio
async def test_provision_concurrent_logins_with_one_username_get_distinct_names(
    db_client, oidc_settings
):
    users = await asyncio.gather(
        *(
            oidc.provision_user(
                db_client,
                ISSUER,
                {"sub": f"sub-{index}", "preferred_username": "carol"},
            )
            for index in range(3)
        )
    )

    assert sorted(user.username for user in users) == ["carol", "carol2", "carol3"]


@pytest.mark.asyncio
async def test_provision_does_not_adopt_a_user_already_linked_to_another_identity(
    db_client, oidc_settings
):
    first = await oidc.provision_user(
        db_client, ISSUER, {"sub": "sub-1", "preferred_username": "alice"}
    )

    second = await oidc.provision_user(
        db_client, ISSUER, {"sub": "sub-2", "preferred_username": "alice"}
    )

    assert second.id != first.id
    assert second.username == "alice2"


@pytest.mark.asyncio
async def test_verify_accepts_a_valid_token(oidc_settings, jwks_route, idp_key):
    claims = await oidc.verify_access_token(mint_token(idp_key))

    assert claims["sub"] == "user-1"


@pytest.mark.asyncio
async def test_verify_accepts_the_client_as_authorised_party(
    oidc_settings, jwks_route, idp_key
):
    token = mint_token(idp_key, aud=["account"], azp=CLIENT_ID)

    assert (await oidc.verify_access_token(token))["azp"] == CLIENT_ID


@pytest.mark.asyncio
async def test_verify_rejects_a_wrong_audience(oidc_settings, jwks_route, idp_key):
    with pytest.raises(ValueError):
        await oidc.verify_access_token(mint_token(idp_key, aud=["someone-else"]))


@pytest.mark.asyncio
async def test_verify_rejects_a_missing_audience(oidc_settings, jwks_route, idp_key):
    with pytest.raises(ValueError):
        await oidc.verify_access_token(mint_token(idp_key, aud=None))


@pytest.mark.asyncio
async def test_verify_can_skip_the_audience_check(
    oidc_settings, jwks_route, idp_key, monkeypatch
):
    monkeypatch.setattr(oidc_settings, "verify_bearer_audience", False)

    claims = await oidc.verify_access_token(mint_token(idp_key, aud=None))

    assert claims["sub"] == "user-1"


@pytest.mark.asyncio
async def test_verify_rejects_a_wrong_issuer(oidc_settings, jwks_route, idp_key):
    with pytest.raises(ValueError):
        await oidc.verify_access_token(mint_token(idp_key, iss="https://evil.example"))


@pytest.mark.asyncio
async def test_verify_rejects_an_expired_token(oidc_settings, jwks_route, idp_key):
    with pytest.raises(ValueError):
        await oidc.verify_access_token(mint_token(idp_key, exp=int(time.time()) - 10))


@pytest.mark.asyncio
async def test_verify_rejects_a_token_without_expiry(
    oidc_settings, jwks_route, idp_key
):
    with pytest.raises(ValueError):
        await oidc.verify_access_token(mint_token(idp_key, exp=None))


@pytest.mark.asyncio
async def test_verify_rejects_a_bad_signature(oidc_settings, jwks_route, idp_key):
    impostor = RSAKey.generate_key(2048, parameters={"kid": idp_key.kid})

    with pytest.raises(ValueError):
        await oidc.verify_access_token(mint_token(impostor))


@pytest.mark.asyncio
async def test_verify_rejects_an_unknown_key_id(oidc_settings, jwks_route, idp_key):
    stranger = RSAKey.generate_key(2048, auto_kid=True)

    with pytest.raises(ValueError):
        await oidc.verify_access_token(mint_token(stranger))


@pytest.mark.asyncio
async def test_verify_rejects_an_unsigned_token(oidc_settings, jwks_route, idp_key):
    with pytest.raises(ValueError):
        await oidc.verify_access_token("eyJhbGciOiJub25lIn0.e30.")


@pytest.mark.asyncio
async def test_verify_rejects_a_symmetric_token(oidc_settings, jwks_route, idp_key):
    now = int(time.time())
    claims = {"iss": ISSUER, "sub": "x", "aud": [CLIENT_ID], "exp": now + 300}
    token = jwt.encode(
        {"alg": "HS256", "kid": idp_key.kid}, claims, OctKey.import_key("s" * 32)
    )

    with pytest.raises(ValueError):
        await oidc.verify_access_token(token)


@pytest.mark.parametrize("token", ["", "not-a-jwt", "a.b.c", "....."])
@pytest.mark.asyncio
async def test_verify_rejects_malformed_tokens(oidc_settings, jwks_route, token):
    with pytest.raises(ValueError):
        await oidc.verify_access_token(token)


@pytest.mark.asyncio
async def test_verify_reports_provider_outage_as_invalid_token(
    oidc_settings, respx_mock, idp_key
):
    respx_mock.get(JWKS_URL).mock(side_effect=httpx.ConnectError("down"))

    with pytest.raises(ValueError):
        await oidc.verify_access_token(mint_token(idp_key))


@pytest.mark.asyncio
async def test_jwks_is_cached_between_verifications(oidc_settings, jwks_route, idp_key):
    await oidc.verify_access_token(mint_token(idp_key))
    await oidc.verify_access_token(mint_token(idp_key))

    assert jwks_route.call_count == 1


@pytest.mark.asyncio
async def test_jwks_refreshes_once_for_a_rotated_key(
    oidc_settings, respx_mock, idp_key, monkeypatch
):
    rotated = RSAKey.generate_key(2048, auto_kid=True)
    route = respx_mock.get(JWKS_URL)
    route.side_effect = [
        httpx.Response(200, json=KeySet([idp_key]).as_dict()),
        httpx.Response(200, json=KeySet([idp_key, rotated]).as_dict()),
    ]
    await oidc.verify_access_token(mint_token(idp_key))
    monkeypatch.setattr(oidc, "JWKS_MIN_REFRESH_SECONDS", 0)

    claims = await oidc.verify_access_token(mint_token(rotated))

    assert claims["sub"] == "user-1"
    assert route.call_count == 2


@pytest.mark.asyncio
async def test_unknown_key_ids_cannot_force_repeated_jwks_fetches(
    oidc_settings, jwks_route, idp_key
):
    await oidc.verify_access_token(mint_token(idp_key))

    for _ in range(5):
        with pytest.raises(ValueError):
            await oidc.verify_access_token(
                mint_token(RSAKey.generate_key(2048, auto_kid=True))
            )

    assert jwks_route.call_count == 1
