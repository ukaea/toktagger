import base64
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from filelock import FileLock
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from toktagger.api import config

_SALT = "toktagger-auth-v1"

_ENCRYPTION_INFO = b"toktagger-stored-secrets-v1"

_serializer: URLSafeTimedSerializer | None = None
_fernet: Fernet | None = None
_internal_token: str | None = None


def get_internal_token() -> str:
    """Return a stable internal token for trusted server-to-server calls.

    Under multiple uvicorn workers, all workers share one Ray cluster and
    call back into each other's server-to-server endpoints, so they must all
    use the same token. TOKTAGGER_INTERNAL_TOKEN is set once by the parent
    process (see `run_server` in main.py) and inherited by every
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


def write_private_file(path: Path, content: str) -> None:
    """Write content to a file that only the owner can read or write."""
    descriptor = os.open(path, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w") as handle:
        handle.write(content)


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
        write_private_file(key_file, secret)
        return secret


def get_signing_secret() -> str:
    if config.settings.auth.secret_key:
        return config.settings.auth.secret_key
    cache_dir = Path(config.settings.server.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    return _read_or_create_secret(cache_dir)


def _get_serializer() -> URLSafeTimedSerializer:
    global _serializer
    if _serializer is None:
        _serializer = URLSafeTimedSerializer(get_signing_secret(), salt=_SALT)
    return _serializer


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = HKDF(
            algorithm=hashes.SHA256(), length=32, salt=None, info=_ENCRYPTION_INFO
        ).derive(get_signing_secret().encode())
        _fernet = Fernet(base64.urlsafe_b64encode(key))
    return _fernet


def encrypt_secret(value: str) -> str:
    """Encrypt a value for storage, with a key derived from the signing secret."""
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str:
    """Decrypt a value from encrypt_secret.

    Raises cryptography.fernet.InvalidToken when the value or the signing secret changed.
    """
    return _get_fernet().decrypt(value).decode()


def create_access_token(data: dict) -> str:
    return _get_serializer().dumps(data)


def decode_token_with_age(token: str) -> tuple[dict, float]:
    """Decode a token, returning its payload and how long ago it was issued."""
    try:
        decoded: tuple[dict, datetime] = _get_serializer().loads(
            token,
            max_age=config.settings.auth.session_idle_timeout_seconds,
            return_timestamp=True,
        )
    except SignatureExpired:
        raise ValueError("Token has expired")
    except BadSignature:
        raise ValueError("Invalid token")
    payload, issued_at = decoded
    age = (datetime.now(timezone.utc) - issued_at).total_seconds()
    return payload, age


def decode_token(token: str) -> dict:
    payload, _ = decode_token_with_age(token)
    return payload
