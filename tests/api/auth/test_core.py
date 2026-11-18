"""Unit tests for toktagger.api.auth.core — no DB or network needed."""

import pytest
from itsdangerous import SignatureExpired

from toktagger.api.auth.core import (
    _get_serializer,
    create_access_token,
    decode_token,
    decode_token_with_age,
)


def test_create_access_token_returns_string():
    token = create_access_token({"sub": "alice"})
    assert isinstance(token, str)
    assert len(token) > 0


def test_decode_token_round_trip():
    payload = {"sub": "alice", "role": "admin"}
    token = create_access_token(payload)
    decoded = decode_token(token)
    assert decoded["sub"] == "alice"
    assert decoded["role"] == "admin"


def test_decode_token_expired(monkeypatch):
    """Simulate an expired token by monkeypatching the serializer's loads to behave
    as if max_age has elapsed.  We achieve this by creating a token, then advancing
    the timestamp embedded in the signature past the expiry window."""

    token = create_access_token({"sub": "expired_user"})

    serializer = _get_serializer()

    _original_loads = serializer.loads

    def fake_loads(data, **kwargs):
        raise SignatureExpired("simulated expiry")

    monkeypatch.setattr(serializer, "loads", fake_loads)

    with pytest.raises(ValueError, match="expired"):
        decode_token(token)


def test_decode_token_invalid_raises():
    with pytest.raises(ValueError, match="Invalid"):
        decode_token("this.is.not.a.valid.token")


def test_decode_token_tampered_raises():
    token = create_access_token({"sub": "alice"})
    tampered = token[:-4] + "XXXX"
    with pytest.raises(ValueError):
        decode_token(tampered)


def test_decode_token_with_age_reports_a_fresh_token_as_new():
    payload, age = decode_token_with_age(create_access_token({"sub": "alice"}))
    assert payload["sub"] == "alice"
    assert 0 <= age < 5


def test_decode_token_with_age_rejects_a_tampered_token():
    token = create_access_token({"sub": "alice"})
    with pytest.raises(ValueError):
        decode_token_with_age(token[:-4] + "XXXX")
