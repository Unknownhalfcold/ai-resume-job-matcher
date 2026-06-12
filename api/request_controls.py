from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timedelta
from typing import Iterator

from fastapi import HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.database import LLMUsageEvent


logger = logging.getLogger("ai_resume_job_matcher.llm")

MAX_LLM_CONCURRENCY = max(1, int(os.getenv("MAX_LLM_CONCURRENCY", "10")))
LLM_SEMAPHORE = threading.BoundedSemaphore(MAX_LLM_CONCURRENCY)
EPHEMERAL_RATE_LIMIT_SALT = secrets.token_bytes(32)

RATE_LIMITS = {
    "normalize_job": {"minute": 5, "day": 30},
    "capability_discovery": {"minute": 3, "day": 20},
    "ai_suggestions": {"minute": 3, "day": 20},
}


def utc_now() -> datetime:
    return datetime.utcnow()


def get_client_ip(request: Request) -> str:
    cloudflare_ip = request.headers.get("cf-connecting-ip")
    if cloudflare_ip:
        return cloudflare_ip.strip()

    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()

    return request.client.host if request.client else "unknown"


def hash_client_ip(request: Request) -> str:
    configured_salt = os.getenv("RATE_LIMIT_SALT")
    salt = configured_salt.encode("utf-8") if configured_salt else EPHEMERAL_RATE_LIMIT_SALT
    return hmac.new(salt, get_client_ip(request).encode("utf-8"), hashlib.sha256).hexdigest()


def get_request_control_metadata() -> dict[str, object]:
    return {
        "max_llm_concurrency": MAX_LLM_CONCURRENCY,
        "rate_limit_salt_configured": bool(os.getenv("RATE_LIMIT_SALT")),
        "privacy_log_mode": "metadata_only",
    }


def enforce_rate_limit(session: Session, request: Request, endpoint: str, input_chars: int) -> LLMUsageEvent:
    limits = RATE_LIMITS[endpoint]
    ip_hash = hash_client_ip(request)
    now = utc_now()

    minute_count = session.scalar(
        select(func.count(LLMUsageEvent.id)).where(
            LLMUsageEvent.ip_hash == ip_hash,
            LLMUsageEvent.endpoint == endpoint,
            LLMUsageEvent.created_at >= now - timedelta(minutes=1),
        )
    ) or 0
    if minute_count >= limits["minute"]:
        raise HTTPException(
            status_code=429,
            detail="请求过于频繁，请稍后再试。",
            headers={"Retry-After": "60"},
        )

    day_count = session.scalar(
        select(func.count(LLMUsageEvent.id)).where(
            LLMUsageEvent.ip_hash == ip_hash,
            LLMUsageEvent.endpoint == endpoint,
            LLMUsageEvent.created_at >= now - timedelta(days=1),
        )
    ) or 0
    if day_count >= limits["day"]:
        raise HTTPException(
            status_code=429,
            detail="今日免费调用次数已用完，请明天再试。",
            headers={"Retry-After": "86400"},
        )

    event = LLMUsageEvent(
        ip_hash=ip_hash,
        endpoint=endpoint,
        input_chars=input_chars,
        status="started",
    )
    session.add(event)
    session.commit()
    session.refresh(event)
    return event


def complete_usage_event(
    session: Session,
    event: LLMUsageEvent,
    status: str,
    started_at: float,
) -> None:
    event.status = status
    event.duration_ms = max(0, round((time.perf_counter() - started_at) * 1000))
    try:
        session.add(event)
        session.commit()
    except Exception:
        session.rollback()
        logger.exception(
            "llm_usage_update_failed endpoint=%s input_chars=%s status=%s",
            event.endpoint,
            event.input_chars,
            status,
        )
        return
    logger.info(
        "llm_request endpoint=%s input_chars=%s status=%s duration_ms=%s",
        event.endpoint,
        event.input_chars,
        event.status,
        event.duration_ms,
    )


@contextmanager
def llm_request_slot() -> Iterator[float]:
    acquired = LLM_SEMAPHORE.acquire(blocking=False)
    if not acquired:
        raise HTTPException(status_code=503, detail="当前服务器繁忙，请稍后再试。")

    started_at = time.perf_counter()
    try:
        yield started_at
    finally:
        LLM_SEMAPHORE.release()
