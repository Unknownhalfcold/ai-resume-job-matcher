from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
from datetime import datetime, timedelta

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


def require_current_user(
    session: Session,
    authorization: str | None = Header(default=None),
) -> User:
    token = get_bearer_token(authorization)
    user = get_user_from_token(session, token)
    if not user:
        raise HTTPException(status_code=401, detail="Session expired or invalid.")
    return user


def revoke_access_token(session: Session, token: str) -> None:
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
