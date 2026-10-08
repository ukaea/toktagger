import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

from filelock import FileLock
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from toktagger.api import config

ACCESS_TOKEN_EXPIRE_SECONDS = 60 * 60 * 24  # 24 hours
# A session past this age is re-issued on use, so an active user is never signed
# out mid-task while an idle one still expires on schedule.
ACCESS_TOKEN_RENEW_AFTER_SECONDS = ACCESS_TOKEN_EXPIRE_SECONDS // 2
_SALT = "toktagger-auth-v1"

_serializer: URLSafeTimedSerializer | None = None
_internal_token: str | None = None


def get_internal_token() -> str:
    """Return a stable internal token for trusted server-to-server calls.

    Under multiple Gunicorn workers, all workers share one Ray cluster and
    call back into each other's server-to-server endpoints, so they must all
    use the same token. TOKTAGGER_INTERNAL_TOKEN is set once by the parent
    process (see `run_with_gunicorn` in main.py) and inherited by every
    worker; falling back to a random per-process token is only correct when
    there is a single process (e.g. --workers 1).
    """
    global _internal_token
    env_token = os.environ.get("TOKTAGGER_INTERNAL_TOKEN")
    if env_token:
        return env_token
    if _internal_token is None:
        _internal_token = secrets.token_urlsafe(32)
    return _internal_token


def _read_or_create_secret(cache_dir: Path) -> str:
    """Return the persisted signing key, generating it on first use."""
    key_file = cache_dir / "secret.key"
    if key_file.exists():
        return key_file.read_text().strip()

    # Workers race here on a shared cache dir, and each caches its own serializer for
    # life - without the lock they persist different keys and reject each other's
    # session cookies. Re-checked inside the lock so only the winner generates.
    with FileLock(str(cache_dir / "secret.key.lock"), timeout=30):
        if key_file.exists():
            return key_file.read_text().strip()
        secret = secrets.token_hex(32)
        # 0600 because this key signs every session cookie.
        fd = os.open(key_file, os.O_CREAT | os.O_WRONLY | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as handle:
            handle.write(secret)
        return secret


def _get_serializer() -> URLSafeTimedSerializer:
    global _serializer
    if _serializer is not None:
        return _serializer

    if config.settings.auth.secret_key:
        secret = config.settings.auth.secret_key
    else:
        cache_dir = Path(config.settings.server.cache_dir)
        cache_dir.mkdir(parents=True, exist_ok=True)
        secret = _read_or_create_secret(cache_dir)

    _serializer = URLSafeTimedSerializer(secret, salt=_SALT)
    return _serializer


def _pbkdf2_hash(password: str, salt_hex: str) -> str:
    dk = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt_hex), 260000
    )
    return dk.hex()


def hash_password(plain: str) -> str:
    salt = secrets.token_hex(16)
    hashed = _pbkdf2_hash(plain, salt)
    return f"pbkdf2:{salt}:{hashed}"


def verify_password(plain: str, stored: str) -> bool:
    if not stored.startswith("pbkdf2:"):
        return False
    try:
        _, salt, expected = stored.split(":")
    except ValueError:
        return False
    return secrets.compare_digest(_pbkdf2_hash(plain, salt), expected)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    return _get_serializer().dumps(data)


def decode_token_with_age(token: str) -> tuple[dict, float]:
    """Decode a token, returning its payload and how long ago it was issued."""
    try:
        payload, issued_at = _get_serializer().loads(
            token, max_age=ACCESS_TOKEN_EXPIRE_SECONDS, return_timestamp=True
        )
    except SignatureExpired:
        raise ValueError("Token has expired")
    except BadSignature:
        raise ValueError("Invalid token")
    age = (datetime.now(timezone.utc) - issued_at).total_seconds()
    return payload, age


def decode_token(token: str) -> dict:
    payload, _ = decode_token_with_age(token)
    return payload
