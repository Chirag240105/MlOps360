"""Track B Security: Scrypt password hashing and HMAC-SHA256 JWT verification."""
import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any, Dict


def hash_password(password: str) -> str:
    salt = os.urandom(16).hex()
    dk = hashlib.scrypt(password.encode("utf-8"), salt=salt.encode("utf-8"), n=16384, r=8, p=1, dklen=64)
    return f"scrypt${salt}${dk.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        scheme, salt, expected_hex = stored_hash.split("$")
        if scheme != "scrypt":
            return False
        actual = hashlib.scrypt(password.encode("utf-8"), salt=salt.encode("utf-8"), n=16384, r=8, p=1, dklen=64)
        return hmac.compare_digest(actual.hex(), expected_hex)
    except ValueError:
        return False


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def create_access_token(payload: Dict[str, Any], secret: str, expires_minutes: int = 60) -> str:
    now = int(time.time())
    body = {**payload, "iat": now, "exp": now + expires_minutes * 60}
    header_b64 = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode("utf-8"))
    body_b64 = _b64url(json.dumps(body).encode("utf-8"))
    sig = hmac.new(secret.encode("utf-8"), f"{header_b64}.{body_b64}".encode("ascii"), hashlib.sha256).digest()
    return f"{header_b64}.{body_b64}.{_b64url(sig)}"


def decode_access_token(token: str, secret: str) -> Dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Malformed JWT")
    header_b64, body_b64, sig_b64 = parts
    expected_sig = _b64url(
        hmac.new(secret.encode("utf-8"), f"{header_b64}.{body_b64}".encode("ascii"), hashlib.sha256).digest()
    )
    if not hmac.compare_digest(sig_b64, expected_sig):
        raise ValueError("Invalid JWT signature")
    padded = body_b64 + "=" * (-len(body_b64) % 4)
    payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
    if payload.get("exp", 0) < int(time.time()):
        raise ValueError("JWT expired")
    return payload
