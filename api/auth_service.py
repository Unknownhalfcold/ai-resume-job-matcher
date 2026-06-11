from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
from datetime import datetime, timedelta
from urllib import error, request

from fastapi import Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.database import AuthSession, User


EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PASSWORD_MIN_LENGTH = 8
PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256"
PASSWORD_HASH_ITERATIONS = 210_000


def utc_now() -> datetime:
    return datetime.utcnow()


def get_token_ttl_days() -> int:
    return int(os.getenv("AUTH_TOKEN_TTL_DAYS", "14"))


def supabase_is_configured() -> bool:
    return bool(os.getenv("SUPABASE_URL") and get_supabase_public_key())


def get_supabase_public_key() -> str:
    return os.getenv("SUPABASE_PUBLISHABLE_KEY") or os.getenv("SUPABASE_ANON_KEY") or ""


def get_auth_metadata() -> dict[str, object]:
    return {
        "auth_provider": "supabase" if supabase_is_configured() else "legacy",
        "supabase_configured": supabase_is_configured(),
        "email_confirmation_required": os.getenv(
            "SUPABASE_REQUIRE_EMAIL_CONFIRMATION",
            "true",
        ).lower() not in {"0", "false", "no"},
    }


def get_auth_client_config() -> dict[str, object]:
    configured = supabase_is_configured()
    return {
        "auth_provider": "supabase" if configured else "legacy",
        "supabase_configured": configured,
        "supabase_url": os.getenv("SUPABASE_URL", "") if configured else "",
        "supabase_publishable_key": get_supabase_public_key() if configured else "",
        "email_confirmation_required": os.getenv(
            "SUPABASE_REQUIRE_EMAIL_CONFIRMATION",
            "true",
        ).lower() not in {"0", "false", "no"},
    }


def normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if not EMAIL_PATTERN.fullmatch(normalized):
        raise ValueError("Please enter a valid email address.")
    return normalized


def validate_password(password: str) -> None:
    if len(password) < PASSWORD_MIN_LENGTH:
        raise ValueError(f"Password must be at least {PASSWORD_MIN_LENGTH} characters.")


def hash_password(password: str) -> str:
    validate_password(password)
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_HASH_ITERATIONS,
    )
    return f"{PASSWORD_HASH_ALGORITHM}${PASSWORD_HASH_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations_text, salt_hex, digest_hex = stored_hash.split("$", 3)
        if algorithm != PASSWORD_HASH_ALGORITHM:
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iterations_text),
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def hash_access_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_user(session: Session, email: str, password: str) -> User:
    normalized_email = normalize_email(email)
    password_hash = hash_password(password)

    existing_user = session.scalar(select(User).where(User.email == normalized_email))
    if existing_user:
        raise ValueError("This email is already registered.")

    user = User(email=normalized_email, password_hash=password_hash)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def authenticate_user(session: Session, email: str, password: str) -> User | None:
    try:
        normalized_email = normalize_email(email)
    except ValueError:
        return None

    user = session.scalar(select(User).where(User.email == normalized_email))
    if not user or not verify_password(password, user.password_hash):
        return None

    user.last_login_at = utc_now()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def create_access_token(session: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    token_hash = hash_access_token(token)
    auth_session = AuthSession(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=utc_now() + timedelta(days=get_token_ttl_days()),
    )
    session.add(auth_session)
    session.commit()
    return token


def get_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header.")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid Authorization header.")
    return token.strip()


def get_user_from_token(session: Session, token: str) -> User | None:
    token_hash = hash_access_token(token)
    auth_session = session.scalar(
        select(AuthSession).where(
            AuthSession.token_hash == token_hash,
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > utc_now(),
        )
    )
    if not auth_session:
        return None
    return session.get(User, auth_session.user_id)


def get_supabase_identity(token: str) -> dict[str, str]:
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    publishable_key = get_supabase_public_key()
    if not supabase_url or not publishable_key:
        raise HTTPException(status_code=503, detail="Supabase authentication is not configured.")

    auth_request = request.Request(
        f"{supabase_url}/auth/v1/user",
        headers={
            "apikey": publishable_key,
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with request.urlopen(auth_request, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (error.HTTPError, error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=401, detail="Supabase session expired or invalid.") from exc

    user_id = str(payload.get("id") or "").strip()
    email = str(payload.get("email") or "").strip().lower()
    email_confirmed_at = str(payload.get("email_confirmed_at") or "").strip()
    confirmation_required = os.getenv(
        "SUPABASE_REQUIRE_EMAIL_CONFIRMATION",
        "true",
    ).lower() not in {"0", "false", "no"}
    if not user_id or not email:
        raise HTTPException(status_code=401, detail="Supabase user identity is incomplete.")
    if confirmation_required and not email_confirmed_at:
        raise HTTPException(status_code=403, detail="Please verify your email before signing in.")
    return {
        "id": user_id,
        "email": email,
    }


def sync_supabase_user(session: Session, identity: dict[str, str]) -> User:
    user = session.scalar(
        select(User).where(User.supabase_user_id == identity["id"])
    )
    if not user:
        user = session.scalar(select(User).where(User.email == identity["email"]))
    if not user:
        user = User(
            supabase_user_id=identity["id"],
            email=identity["email"],
            password_hash="supabase_managed",
        )
    else:
        user.supabase_user_id = identity["id"]
        user.email = identity["email"]

    user.last_login_at = utc_now()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def require_current_user(
    session: Session,
    authorization: str | None = Header(default=None),
) -> User:
    token = get_bearer_token(authorization)
    if supabase_is_configured():
        return sync_supabase_user(session, get_supabase_identity(token))
    user = get_user_from_token(session, token)
    if not user:
        raise HTTPException(status_code=401, detail="Session expired or invalid.")
    return user


def revoke_access_token(session: Session, token: str) -> None:
    if supabase_is_configured():
        return
    token_hash = hash_access_token(token)
    auth_session = session.scalar(
        select(AuthSession).where(
            AuthSession.token_hash == token_hash,
            AuthSession.revoked_at.is_(None),
        )
    )
    if not auth_session:
        return
    auth_session.revoked_at = utc_now()
    session.add(auth_session)
    session.commit()
