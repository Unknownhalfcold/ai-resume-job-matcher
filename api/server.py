from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from api.auth_service import (
    authenticate_user,
    create_access_token,
    create_user,
    get_bearer_token,
    require_current_user,
    revoke_access_token,
)
from api.database import User, get_database_metadata, get_database_session, initialize_database
from api.document_parser import DocumentParseError, extract_resume_text
from api.llm_advisor import (
    LLMConfigurationError,
    generate_advice,
    get_llm_analysis_contract,
    get_llm_config,
    get_llm_metadata,
)
from scripts.analyze_match import analyze, load_keywords


DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "https://unknownhalfcold.github.io",
)


class AnalyzeRequest(BaseModel):
    resume: str = Field(..., min_length=1)
    job: str = Field(..., min_length=1)


class LLMRequestConfig(BaseModel):
    provider: str | None = Field(default=None, max_length=64)
    api_key: str | None = Field(default=None, max_length=4096)
    model: str | None = Field(default=None, max_length=128)
    api_style: str | None = Field(default=None, max_length=32)
    base_url: str | None = Field(default=None, max_length=512)
    max_output_tokens: int | None = Field(default=None, ge=300, le=6000)
    temperature: float | None = Field(default=None, ge=0, le=1)


class AISuggestionsRequest(AnalyzeRequest):
    analysis: dict[str, Any] | None = None
    llm_config: LLMRequestConfig | None = None


class AuthRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    password: str = Field(..., min_length=8, max_length=128)


class UTF8JSONResponse(JSONResponse):
    media_type = "application/json; charset=utf-8"


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    yield


def get_allowed_origins() -> list[str]:
    raw_value = os.getenv("ALLOWED_ORIGINS")
    if not raw_value:
        return list(DEFAULT_ALLOWED_ORIGINS)
    return [origin.strip() for origin in raw_value.split(",") if origin.strip()]


app = FastAPI(
    title="AI Resume Job Matcher API",
    version="0.1.0",
    description="Rule-based backend API for resume-job matching analysis.",
    default_response_class=UTF8JSONResponse,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)

KEYWORDS = load_keywords()
MAX_UPLOAD_BYTES = 8 * 1024 * 1024


def serialize_user(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "created_at": user.created_at.isoformat(),
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
    }


def current_user_dependency(
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_database_session),
) -> User:
    return require_current_user(session, authorization)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "engine": "rule_based",
        "keyword_count": len(KEYWORDS),
        **get_database_metadata(),
        **get_llm_metadata(),
    }


@app.get("/api/keywords")
def keywords() -> dict[str, Any]:
    return {
        "keywords": [
            {
                "name": keyword.name,
                "category": keyword.category,
                "weight": keyword.weight,
                "aliases": list(keyword.aliases),
                "suggestion": keyword.suggestion,
            }
            for keyword in KEYWORDS
        ]
    }


@app.post("/api/auth/register")
def register(payload: AuthRequest, session: Session = Depends(get_database_session)) -> dict[str, Any]:
    try:
        user = create_user(session, payload.email, payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    access_token = create_access_token(session, user)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": serialize_user(user),
    }


@app.post("/api/auth/login")
def login(payload: AuthRequest, session: Session = Depends(get_database_session)) -> dict[str, Any]:
    user = authenticate_user(session, payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")

    access_token = create_access_token(session, user)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": serialize_user(user),
    }


@app.get("/api/auth/me")
def me(current_user: User = Depends(current_user_dependency)) -> dict[str, Any]:
    return {
        "user": serialize_user(current_user),
    }


@app.post("/api/auth/logout")
def logout(
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_database_session),
) -> dict[str, Any]:
    if authorization:
        token = get_bearer_token(authorization)
        revoke_access_token(session, token)
    return {"ok": True}


@app.post("/api/analyze")
def analyze_resume_job(payload: AnalyzeRequest) -> dict[str, Any]:
    result = analyze(payload.resume, payload.job, keywords=KEYWORDS)
    return {
        "engine": "rule_based",
        **result,
    }


@app.post("/api/extract/resume")
async def extract_resume(file: UploadFile = File(...)) -> dict[str, Any]:
    content = await file.read()

    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Uploaded file is larger than 8 MB.")

    try:
        text, warnings = extract_resume_text(file.filename or "", content)
    except DocumentParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "filename": file.filename,
        "text": text,
        "character_count": len(text),
        "warnings": warnings,
    }


@app.post("/api/ai-suggestions")
def ai_suggestions(payload: AISuggestionsRequest) -> dict[str, Any]:
    analysis = payload.analysis or analyze(payload.resume, payload.job, keywords=KEYWORDS)
    config_override = payload.llm_config.model_dump(exclude_none=True) if payload.llm_config else None
    llm_config = get_llm_config(config_override)

    try:
        advice = generate_advice(payload.resume, payload.job, analysis, config_override=config_override)
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM request failed: {exc}") from exc

    return {
        "engine": "llm_advice",
        "provider": llm_config.provider,
        "model": llm_config.model,
        "api_style": llm_config.api_style,
        "rule_score": analysis.get("score"),
        "rule_score_source": "keyword_weight_formula",
        "analysis_contract": get_llm_analysis_contract(),
        "advice": advice,
    }
